/*
 * Home Assistant sign-in with user name and password, the alternative to pasting a long-lived token.
 * It is Home Assistant's own OAuth2 authorization code flow (developers.home-assistant.io → Authentication
 * API; core: components/auth/login_flow.py and auth/__init__.py), driven from the TV instead of a browser:
 *
 *   POST /auth/login_flow             { client_id, handler: ["homeassistant", null], redirect_uri } → flow_id
 *   POST /auth/login_flow/<flow_id>   { client_id, username, password }, then { client_id, code } for a
 *                                     second factor → "create_entry" with the authorization code in `result`
 *   POST /auth/token                  grant_type=authorization_code → access token (30 min) + refresh token
 *   POST /auth/token                  grant_type=refresh_token → a new access token
 *   POST /auth/revoke                 token=<refresh token> (older versions: /auth/token with action=revoke)
 *
 * Pairing with the phone (js/ha-pair.js) uses the integration ordiscale_tv instead (homeassistant/API.md):
 *
 *   POST /api/ordiscale_tv/pair/start  { name } → pairing_id, poll_secret, user_code, approve_url
 *   POST /api/ordiscale_tv/pair/poll   { pairing_id, poll_secret } → pending | denied | expired |
 *                                      approved with refresh token, first access token and client_id
 *
 * and then renews through /auth/token like a password sign-in, with the client_id it was given.
 *
 * Only the refresh token is stored (Prefs.homeAssistant.refresh, by settings.js); the password is sent once
 * and kept nowhere, the access token lives in memory (js/homeassistant.js). The log gets steps and error
 * codes, never a token, a password or a user name.
 *
 * CORS: /auth/token and /auth/revoke answer every origin (cors_allowed = True in HA). /auth/login_flow
 * answers only the origins in http → cors_allowed_origins. Whether the TV's packaged app is held to CORS
 * at all is not documented (CLAUDE.md, Home Assistant); a refused request and an unreachable server look
 * the same to fetch, so a failure is told apart by opening the WebSocket (no CORS there): it answers →
 * the sign-in page was refused (`blocked`), it does not → `unreachable`.
 */
(function () {
    'use strict';

    /*
     * Home Assistant names OAuth clients by a URL (IndieAuth) and needs no registration. A domain name is
     * accepted as client_id as it is (auth/indieauth.py _parse_client_id refuses only foreign IP
     * addresses), and a redirect_uri with the same scheme and host is accepted before HA would fetch
     * anything from it (verify_redirect_uri returns early). Nothing is ever redirected there, the TV reads
     * the code from the flow's answer, so no page has to exist. A fixed address of our own: not the
     * household's, and HA lists the session under it (Profil → Sicherheit, refresh tokens show their
     * client_id), which tells the viewer what it is. Refresh and sign-in must use the same one.
     */
    var CLIENT_ID = 'https://ordiscale.de/launcher/';
    var REDIRECT_URI = CLIENT_ID;
    var HANDLER = ['homeassistant', null];   // HA's own user database; other providers have no password form
    var TIMEOUT = 15000;
    var PROBE_TIMEOUT = 6000;

    var log = DevLog.log;

    function form(fields) {
        return Object.keys(fields).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(fields[k]);
        }).join('&');
    }

    // One request; resolves with { status, json } for any HTTP answer, rejects with { code: 'network' }
    // when fetch fails (no server, refused by CORS, certificate) or { code: 'timeout' }.
    function request(method, url, body, type) {
        return new Promise(function (resolve, reject) {
            var ctrl = window.AbortController ? new AbortController() : null;
            var timer = setTimeout(function () {
                if (ctrl) ctrl.abort();
                reject({ code: 'timeout' });
            }, TIMEOUT);
            var opts = { method: method, credentials: 'omit', cache: 'no-store' };
            if (ctrl) opts.signal = ctrl.signal;
            if (body !== undefined) {
                opts.body = body;
                opts.headers = { 'Content-Type': type };
            }
            fetch(url, opts).then(function (res) {
                return res.text().then(function (text) {
                    var json = null;
                    try {
                        json = text ? JSON.parse(text) : null;
                    } catch (e) {
                        // Not JSON (a proxy's error page): the status says enough.
                    }
                    clearTimeout(timer);
                    resolve({ status: res.status, json: json });
                });
            }).catch(function () {
                clearTimeout(timer);
                reject({ code: 'network' });
            });
        });
    }

    // The login flow takes JSON. Sent as text/plain, which HA parses all the same (aiohttp request.json()
    // ignores the type), so the request needs no CORS preflight: one hurdle less where an origin is allowed.
    function postJson(url, data) {
        return request('POST', url, JSON.stringify(data), 'text/plain;charset=UTF-8');
    }

    function postForm(url, fields) {
        return request('POST', url, form(fields), 'application/x-www-form-urlencoded');
    }

    function socketUrl(base) {
        return base.replace(/^http/i, 'ws') + '/api/websocket';
    }

    // Does Home Assistant answer at all? Opens the WebSocket and waits for its first message
    // (auth_required), then closes without signing in: nothing is sent, nothing counts as a failed login.
    function probe(base) {
        return new Promise(function (resolve) {
            var done = false;
            var s = null;
            function finish(ok) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (s) {
                    s.onmessage = s.onclose = s.onerror = null;
                    try {
                        s.close();
                    } catch (e) {
                        // Already closed.
                    }
                }
                resolve(ok);
            }
            var timer = setTimeout(function () { finish(false); }, PROBE_TIMEOUT);
            try {
                s = new WebSocket(socketUrl(base));
            } catch (e) {
                finish(false);
                return;
            }
            s.onmessage = function (e) {
                var msg = null;
                try {
                    msg = JSON.parse(e.data);
                } catch (err) {
                    // Not Home Assistant.
                }
                finish(!!(msg && msg.type === 'auth_required'));
            };
            s.onclose = function () { finish(false); };
            s.onerror = function () {};
        });
    }

    // A failed fetch during sign-in: refused by the browser (CORS) or nothing there?
    function explain(base, err) {
        if (!err || (err.code !== 'network' && err.code !== 'timeout')) return Promise.reject(err);
        return probe(base).then(function (reachable) {
            var code = reachable && err.code === 'network' ? 'blocked' : 'unreachable';
            log('Home Assistant sign-in: request failed (' + err.code + '), WebSocket ' +
                (reachable ? 'answers' : 'does not answer') + ' → ' + code + ' (page origin ' + location.protocol + ')');
            throw { code: code };
        });
    }

    function httpError(r, where) {
        log('Home Assistant sign-in: ' + where + ' answered HTTP ' + r.status +
            (r.json && r.json.error ? ' (' + r.json.error + ')' : ''));
        if (r.status === 403) return { code: 'denied', status: r.status };
        return { code: 'http', status: r.status };
    }

    function begin(base) {
        return postJson(base + '/auth/login_flow', { client_id: CLIENT_ID, handler: HANDLER, redirect_uri: REDIRECT_URI })
            .then(function (r) {
                if (r.status === 200 && r.json && r.json.flow_id) return r.json;
                // "Invalid handler specified": no Home Assistant user database (only other providers).
                if (r.status === 404) {
                    log('Home Assistant sign-in: no password login on this server (404)');
                    throw { code: 'no_provider' };
                }
                throw httpError(r, 'login_flow');
            });
    }

    function send(base, flowId, data) {
        data.client_id = CLIENT_ID;
        return postJson(base + '/auth/login_flow/' + encodeURIComponent(flowId), data).then(function (r) {
            if (r.status === 200 && r.json) return r.json;
            if (r.status === 404) throw { code: 'flow_gone' };
            throw httpError(r, 'login step');
        });
    }

    // Leaves a flow that will not be finished. Best effort: HA drops it on its own later.
    function cancel(base, flowId) {
        request('DELETE', base + '/auth/login_flow/' + encodeURIComponent(flowId)).catch(function () {});
    }

    function tokens(r) {
        var j = r.json || {};
        return { access: j.access_token, refresh: j.refresh_token, expiresIn: +j.expires_in || 1800 };
    }

    function exchange(base, code) {
        return postForm(base + '/auth/token', { grant_type: 'authorization_code', code: code, client_id: CLIENT_ID })
            .then(function (r) {
                if (r.status === 200 && r.json && r.json.access_token && r.json.refresh_token) return tokens(r);
                throw httpError(r, 'token');
            }, function (err) {
                throw { code: err.code === 'network' || err.code === 'timeout' ? 'unreachable' : err.code };
            });
    }

    /*
     * signIn(base, username, password, ask) → Promise of { refresh, access, expiresIn }.
     * ask(question) → Promise of the answer, rejected with { code: 'cancelled' } when the viewer gives up:
     *   { kind: 'code', retry, module }   a second factor's code (retry: the last one was wrong)
     *   { kind: 'module', options }       which second factor, when the user has several ([[id, name]])
     * Rejects with { code }: invalid_auth, blocked, unreachable, no_provider, flow_gone, too_slow,
     * too_many, denied, cancelled, http, unexpected.
     */
    function signIn(base, username, password, ask) {
        var flowId = null;
        var sentLogin = false;
        var codeTries = 0;

        function giveUp(err) {
            if (flowId) cancel(base, flowId);
            throw err;
        }

        function step(s) {
            flowId = s.flow_id || flowId;
            var error = s.errors && s.errors.base;
            if (s.type === 'create_entry') {
                log('Home Assistant sign-in: accepted');
                flowId = null;
                return exchange(base, s.result);
            }
            if (s.type === 'abort') {
                log('Home Assistant sign-in: aborted (' + s.reason + ')');
                flowId = null;
                throw { code: s.reason === 'login_expired' ? 'too_slow' : s.reason === 'too_many_retry' ? 'too_many' : 'unexpected', reason: s.reason };
            }
            if (s.type !== 'form') throw { code: 'unexpected' };
            if (s.step_id === 'init') {
                if (sentLogin) {
                    log('Home Assistant sign-in: refused (' + (error || 'no error') + ')');
                    return giveUp({ code: error === 'invalid_auth' ? 'invalid_auth' : 'unexpected' });
                }
                sentLogin = true;
                var data = { username: username, password: password };
                password = null;    // sent once, not kept in this closure
                return send(base, flowId, data).then(step);
            }
            if (s.step_id === 'select_mfa_module') {
                var field = (s.data_schema || [])[0] || {};
                log('Home Assistant sign-in: choose second factor');
                return ask({ kind: 'module', options: field.options || [] }).then(function (id) {
                    return send(base, flowId, { multi_factor_auth_module: id }).then(step);
                }, giveUp);
            }
            if (s.step_id === 'mfa') {
                // The field is "code" for the TOTP and notify modules; taken from the form anyway.
                var name = ((s.data_schema || [])[0] || {}).name || 'code';
                var module = (s.description_placeholders || {}).mfa_module_name || '';
                if (error === 'invalid_code') codeTries++;
                log('Home Assistant sign-in: second factor' + (error ? ' (' + error + ')' : ''));
                return ask({ kind: 'code', retry: codeTries > 0, module: module }).then(function (code) {
                    var answer = {};
                    answer[name] = code;
                    return send(base, flowId, answer).then(step);
                }, giveUp);
            }
            log('Home Assistant sign-in: unknown step ' + s.step_id);
            return giveUp({ code: 'unexpected' });
        }

        log('Home Assistant sign-in: start');
        return begin(base).then(step).catch(function (err) {
            return explain(base, err);
        });
    }

    // ---------- Pairing with the phone (integration ordiscale_tv, homeassistant/API.md)

    var PAIR_PATH = '/api/ordiscale_tv/pair/';

    // The pairing id is not secret (it is in the QR code), but the log gets only its start anyway,
    // like the integration's own log. Secret, code and tokens never reach the log.
    function shortId(id) {
        return String(id || '').slice(0, 6);
    }

    /*
     * pairStart(base, name) → Promise of { id, secret, code, approvePath, expiresIn, interval }.
     * Rejects with { code }: not_installed (404: no integration), disabled (503), busy (429, with
     * retryAfter in s), unreachable, http (with status), unexpected.
     * JSON is sent as text/plain, as the integration allows: no CORS preflight.
     */
    function pairStart(base, name) {
        var body = name ? { name: String(name).slice(0, 40) } : {};
        return postJson(base + PAIR_PATH + 'start', body).then(function (r) {
            var j = r.json || {};
            if (r.status === 200 && j.pairing_id && j.poll_secret && j.user_code && j.approve_url) {
                log('Home Assistant pairing: started (' + shortId(j.pairing_id) + ')');
                return {
                    id: String(j.pairing_id),
                    secret: String(j.poll_secret),
                    code: String(j.user_code),
                    approvePath: String(j.approve_url),
                    expiresIn: Math.max(10, +j.expires_in || 300),
                    interval: Math.max(1, +j.interval || 2)
                };
            }
            log('Home Assistant pairing: start answered HTTP ' + r.status + (j.error ? ' (' + j.error + ')' : ''));
            if (r.status === 404) throw { code: 'not_installed' };
            if (r.status === 503) throw { code: 'disabled' };
            if (r.status === 429) throw { code: 'busy', retryAfter: +j.retry_after || 60 };
            if (r.status === 200) throw { code: 'unexpected' };
            throw { code: 'http', status: r.status };
        }, function (err) {
            log('Home Assistant pairing: start failed (' + err.code + ')');
            throw { code: 'unreachable' };
        });
    }

    /*
     * One poll → Promise of { status }: 'pending', 'denied', 'expired', 'wait' (429, retryAfter in s),
     * 'offline' (no answer; the caller tries again), 'approved' with { refresh, access, expiresIn,
     * clientId }. Other answers resolve as { status: 'error', http }.
     */
    function pairPoll(base, pairing) {
        return postJson(base + PAIR_PATH + 'poll', { pairing_id: pairing.id, poll_secret: pairing.secret }).then(function (r) {
            var j = r.json || {};
            if (r.status === 200 && j.status === 'approved') {
                if (!j.refresh_token || !j.client_id) {
                    log('Home Assistant pairing: approved without a token (' + shortId(pairing.id) + ')');
                    return { status: 'error', http: r.status };
                }
                log('Home Assistant pairing: approved (' + shortId(pairing.id) + ')');
                return {
                    status: 'approved', refresh: j.refresh_token, access: j.access_token || null,
                    expiresIn: +j.expires_in || 1800, clientId: String(j.client_id)
                };
            }
            if (r.status === 200 && j.status === 'pending') return { status: 'pending' };
            var result;
            if ((r.status === 200 || r.status === 409) && j.status === 'denied') result = { status: 'denied' };
            else if (r.status === 410) result = { status: 'expired' };
            else if (r.status === 429) result = { status: 'wait', retryAfter: +j.retry_after || 5 };
            else result = { status: 'error', http: r.status };
            log('Home Assistant pairing: ' + result.status + ' (' + shortId(pairing.id) + ', HTTP ' + r.status +
                (j.error ? ' ' + j.error : '') + ')');
            return result;
        }, function (err) {
            return { status: 'offline', reason: err.code };
        });
    }

    /*
     * A new access token from the stored refresh token → { access, expiresIn }. Rejects with
     * { code: 'expired' } when HA no longer knows it (400: revoked, deleted in the profile, 90 days
     * unused), 'denied' (403: user deactivated or not allowed from here), 'unreachable', 'http'.
     * Every refusal counts as a failed login in HA (ban counter), so the caller must not repeat it.
     */
    // clientId: the one the refresh token was issued to (a paired TV has its own); default CLIENT_ID.
    // OAuth errors with which Home Assistant's /auth/token says the refresh token is no good.
    var RENEWAL_REFUSED = ['invalid_grant', 'invalid_request', 'invalid_client', 'access_denied', 'unauthorized_client'];

    function refresh(base, refreshToken, clientId) {
        return postForm(base + '/auth/token', { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId || CLIENT_ID })
            .then(function (r) {
                if (r.status === 200 && r.json && r.json.access_token) return tokens(r);
                // Only Home Assistant's own OAuth answer ends the sign-in. A 400/403 page from a
                // proxy in between (or anything else) is a passing fault: the token is kept.
                var error = r.json && r.json.error;
                if ((r.status === 400 || r.status === 403) && RENEWAL_REFUSED.indexOf(error) >= 0) {
                    log('Home Assistant: renewal refused (' + r.status + ' ' + error + ')');
                    throw { code: 'expired' };
                }
                log('Home Assistant: renewal answered HTTP ' + r.status + (error ? '' : ' without an OAuth error (proxy?)') + ': kept, retried later');
                throw { code: 'http', status: r.status };
            }, function (err) {
                throw { code: err.code === 'network' || err.code === 'timeout' ? 'unreachable' : err.code };
            });
    }

    // Signs the TV out in Home Assistant: the refresh token and every access token from it stop working.
    // Resolves once HA answered; rejects { code: 'unreachable' } when it could not be asked.
    function revoke(base, refreshToken) {
        if (!refreshToken) return Promise.resolve();
        return postForm(base + '/auth/revoke', { token: refreshToken }).then(function (r) {
            // Before /auth/revoke existed, the token endpoint did it (still accepted, deprecated).
            if (r.status === 404 || r.status === 405) {
                return postForm(base + '/auth/token', { token: refreshToken, action: 'revoke' });
            }
            return r;
        }).then(function (r) {
            log('Home Assistant: sign-out answered HTTP ' + r.status);
            if (r.status !== 200) throw { code: 'http', status: r.status };
        }, function (err) {
            log('Home Assistant: sign-out not delivered (' + err.code + ')');
            throw { code: 'unreachable' };
        });
    }

    window.HAAuth = {
        CLIENT_ID: CLIENT_ID,
        signIn: signIn,
        refresh: refresh,
        revoke: revoke,
        pairStart: pairStart,
        pairPoll: pairPoll,
        shortId: shortId
    };
})();
