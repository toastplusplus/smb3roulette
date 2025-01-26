'use strict';
localStorage.setItem('zzz', 'zzz');

function setError(errMsg) {
  console.error(errMsg);
  document.getElementById('errorDiv').textContent = errMsg;
}

function requestDeviceCode() {
  const formData = new FormData();
  formData.set('client_id', twitchAppClientId);
  formData.set('scopes', 'channel:read:redemptions');

  fetch('https://id.twitch.tv/oauth2/device', {
    method: 'POST',
    body: formData,
    headers: {
      'Accept': 'application/json'
    }
  }).then((resp) => {
    return resp.json();
  }).then((respJson) => {
    if (respJson.status) {
      if (respJson.status) {
        setError(`Request to get Twitch device code failed with: ${respJson.message}`);
      }
    } else {
      const timeNow = new Date().getTime();
      localStorage.setItem('smb3DeviceCode', respJson.device_code);
      localStorage.setItem('smb3DeviceCodeExpireTime', timeNow + (respJson.expires_in * 1000));

      window.location.href = respJson.verification_uri;
    }
  }).catch((e) => {
    setError(`Request to get Twitch auth failed with: ${e.message}`);
  });
}

requestDeviceCode();