function buildFormData(data) {
  let formArr = [];

  for (let name in data) {
    let val = data[name];
    if (val !== undefined && val !== '') {
      formArr.push(
        [name, '=', encodeURIComponent(val).replace(/%20/g, '+')].join(''),
      );
    }
  }
  return formArr.join('&');
}

function getAuth() {
  return window.ui.authSelectors.authorized().toJS()?.OAuth2;
}

function tryRefreshOauth2Token() {
  const auth = getAuth();
  if (!auth) {
    console.log(`Swagger is not authorized. Can't refresh token.`);
    return;
  }

  const { schema, name, clientId, clientSecret, token } = auth;
  const errors = [];
  switch (true) {
    case schema == null:
      errors.push('Invalid auth: missing schema');
    case schema?.tokenUrl == null:
      errors.push('Invalid auth schema: missing tokenUrl');
    case name == null:
      errors.push('Invalid auth: missing name');
    case clientId == null:
      errors.push('Invalid auth: missing clientId');
    case clientSecret == null:
      errors.push('Invalid auth: missing clientSecret');
    case token == null:
      errors.push('Invalid auth: missing token');
    case token?.refresh_token == null:
      errors.push('Invalid auth: missing refresh token');
  }
  if (errors.length) {
    console.log("Can't refresh token due to the following issues:");
    errors.forEach(console.log);
    return;
  }

  const form = {
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  };

  console.log(`Refreshing token...`);
  window.ui.authActions.authorizeRequest({
    body: buildFormData(form),
    name,
    url: schema.tokenUrl,
    auth,
  });
}

function ensureTimerElement() {
  let timerElement = document.getElementById('token-timer');
  if (!timerElement) {
    const authorizeButton = document.querySelector('.authorize');
    if (authorizeButton) {
      timerElement = document.createElement('span');
      timerElement.id = 'token-timer';
      timerElement.style.marginRight = '10px';
      timerElement.style.display = 'flex';
      timerElement.style.alignItems = 'center';
      authorizeButton.parentNode.insertBefore(timerElement, authorizeButton);
    }
  }

  return timerElement;
}

function removeTimerElement() {
  const timerElement = document.getElementById('token-timer');
  if (timerElement) {
    if (window.refreshInterval) clearInterval(window.refreshInterval);
    if (window.expiryInterval) clearInterval(window.expiryInterval);
    timerElement.remove();
  }
}

function updateTimer(remainingRefreshTime, remainingExpiryTime) {
  if (remainingRefreshTime < 0) remainingRefreshTime = 0;
  if (remainingExpiryTime < 0) remainingExpiryTime = 0;

  // Only show timer if the ui is authorized & the remaining time is positive
  if (getAuth() && (remainingRefreshTime || remainingExpiryTime)) {
    const timerElement = ensureTimerElement();
    timerElement.innerHTML = `<b style="margin-right: 5px">Authorized! </b> Token refreshes in ${(
      remainingRefreshTime / 1000
    ).toFixed(0)}s, would expire in ${(remainingExpiryTime / 1000).toFixed(
      0,
    )}s`;
  } else removeTimerElement();
}

function startClock() {
  function tick() {
    const remainingRefreshTime = window.tokenRefreshTime - Date.now();
    const remainingExpiryTime = window.tokenExpiryTime - Date.now();

    updateTimer(remainingRefreshTime, remainingExpiryTime);

    if (remainingRefreshTime < 0) {
      clearInterval(window.tokenClockInterval);
      tryRefreshOauth2Token();
    }
  }

  if (window.tokenClockInterval) clearInterval(window.tokenClockInterval);

  window.tokenClockInterval = setInterval(tick, 500);
  tick();
}

var origAuthorizeOauth2 = null;

function authorizeOauth2Hook(payload) {
    // If the token can expire and has a refresh token, schedule a token refresh and update the timer
    if (payload.token.expires_in && payload.token.refresh_token) {
      const tokenRefreshTimeout = payload.token.expires_in * 750;
      const tokenExpiryTimeout = payload.token.expires_in;
      console.log(
        `Refreshable token detected. Scheduling token refresh in ${(
          tokenRefreshTimeout /
          1000 /
          60
        ).toFixed(1)}min (expires in ${(payload.token.expires_in / 60).toFixed(
          1,
        )}min)...`,
      );
      window.tokenRefreshTime = Date.now() + payload.token.expires_in * 750;
      window.tokenExpiryTime = Date.now() + payload.token.expires_in * 1000;

      // Start the clock
      startClock(tokenRefreshTimeout / 1000, tokenExpiryTimeout);
    }

    return origAuthorizeOauth2(payload);
}

let patchTries = 10;
function patchRefreshHook() {
  if (!window?.ui?.authActions?.authorizeOauth2) {
    if (patchTries) {
      patchTries--;
      setTimeout(patchRefreshHook, 1000);
      console.log(
        'Missing patch target function "window.ui.authActions.authorizeOauth2", retrying in 1s...',
      );
      return;
    }
    console.log(
      'Cannot patch OAuth token refresh hook. Missing patch target function "window.ui.authActions.authorizeOauth2"',
    );
    return;
  }

  console.log('Patching OAuth token refresh hook...');
  origAuthorizeOauth2 = window.ui.authActions.authorizeOauth2;

  window.ui.authActions.authorizeOauth2 = authorizeOauth2Hook;

  startClock();
}

patchRefreshHook();

document.addEventListener("DOMContentLoaded", function() {
  setTimeout(function () {
  var initialOAuth = getAuth();  

  if (!initialOAuth) {
    return;
  }

  authorizeOauth2Hook(initialOAuth)
  }, 500)
})
