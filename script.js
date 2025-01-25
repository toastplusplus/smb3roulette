'use strict';

// Twitch Config
// This is normally the only part you'd want to update
const twitchEnabled = true; // UPDATE ME
const twitchRewardTitle = 'Stop the roulette'; // UPDATE ME
const twitchUserName = 'happytoaster1'; // UPDATE ME
const twitchAppClientId = 'nuzm3folc6kvdmgvgye31eiq6ufd1e';

// HTML resource config
const imageIds = [
  'background',
  'border',
  'mushroom',
  'flower',
  'star'
];
const audioIds = [
  'music_loop',
  'one_up',
  'match',
  'no_match'
];
const matchData = [{
  imageId: 'star',
  prizeId: '5up'
}, {
  imageId: 'mushroom',
  prizeId: '2up'
}, {
  imageId: 'flower',
  prizeId: '3up'
}, {
  imageId: 'mushroom',
  prizeId: '2up'
}];

// Loading data
const imageMap = new Map();
const audioMap = new Map();

let pageVisible = document.visibilityState === 'visible';
let loadedFiles = false;
let started = true; // TODO: revert

// Canvas data
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext("2d");
const box = canvas.getBoundingClientRect();
let canvasWidth = box.width;
let canvasHeight = box.height;

const RESET_POSITION = -576; // -1 * (512 + 64)
const ROW_START_SPEEDS = [-.16, .16, -.24];
const ROW_START_OFFSETS = [0, 0, 0];

const RENDER_OFFSET = -64;
const IMAGE_OFFSET = 128;
const REPEAT_SIZE = IMAGE_OFFSET * 4;

const SLOWING_SPEED_MULT = .5;
const SHAKE_TIME_MS = 500;

let lastTimestamp = null;
let currentGameHandler = null;

let rowSpeeds = ROW_START_SPEEDS.slice();
let rowOffsets = ROW_START_OFFSETS.slice();
let rowMatches = [null, null, null];
let currentRowIndex = 0;
let isSlowing = false;
let slowDestination = null;

let isShaking = false;
let shakeTime = 0;

// Music and image loading process
let loadingPromises = [];
for (const imageId of imageIds) {
  let promise = new Promise((resolve, reject) => {
    const imageElem = document.getElementById(imageId);
    if (imageElem.complete) {
      console.log(`Loaded image ${imageId} (loaded immediately)`);
      resolve();
    } else {
      imageElem.addEventListener('load', () => {
        console.log(`Loaded image ${imageId}`);
        resolve();
      });
      imageElem.addEventListener('error', (err) => {
        console.error(`Error loading image ${imageId}`);
        reject();
      });
    }
    imageMap.set(imageId, imageElem);
  });
  loadingPromises.push(promise);
}

for (const audioId of audioIds) {
  let promise = new Promise((resolve, reject) => {
    const audioElem = document.getElementById(audioId);
    audioElem.addEventListener('loadeddata', () => {
      console.log(`Loaded audio ${audioId}`);
      resolve()
    });
    audioElem.addEventListener('error', (err) => {
      console.error(`Error audio ${audioId}`);
      reject();
    });
    audioMap.set(audioId, audioElem);
  });
  loadingPromises.push(promise);
}

Promise.all(loadingPromises).then(() => {
  loadedFiles = true;
  if (started) {
    startup();
  }
});

function startup() {
  console.log('Starting');

  for (let match of matchData) {
    match.image = imageMap.get(match.imageId);
    match.prize = imageMap.get(match.prizeId);
  }
  
  currentGameHandler = new InteractiveGameHandler();

  document.getElementById('pressSpace').style.display = 'none';
  resizeCanvas();
  window.requestAnimationFrame(gameRender);
}

function handleInteraction() {
  if (!started) {
    started = true;
    if (loadedFiles) {
      startup();
    }
  } else {
    currentGameHandler.interact();
  }
}

document.addEventListener('visibilitychange', function() {
  pageVisible = document.visibilityState === 'visible';
  if (pageVisible) {
    console.log('Page visible');
    if (started) {
      window.requestAnimationFrame(gameRender);
    }
  } else {
    console.log('Page not visible');
    lastTimestamp = null;
  }
});

document.addEventListener('click', function(event) {
  handleInteraction();
});

document.addEventListener('keypress', function(event) {
  if (event.code === 'Space') {
    handleInteraction();
  }
});

function resizeCanvas() {
  const desiredAspectRatio = (13.0 / 9.0);
  const actualAspectRatio = window.innerWidth / window.innerHeight;

  if (actualAspectRatio > desiredAspectRatio) {
    canvasWidth = window.innerHeight * (13.0 / 9.0);
    canvasHeight = window.innerHeight;
  } else if (actualAspectRatio < desiredAspectRatio) {
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerWidth * (9.0 / 13.0);
  } else {
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
  }

  canvasWidth = Math.floor(canvasWidth);
  canvasHeight = Math.floor(canvasHeight);
  canvas.setAttribute('width', `${canvasWidth}px`);
  canvas.setAttribute('height', `${canvasHeight}px`);

  // This seems to be need to reset whenever you resize in firefox
  ctx.webkitImageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener('resize', function() {
  if (started) {
    resizeCanvas();
  }
});

// RowIndex is the prize gmae row
// Offset is in logical game pixels, (234 pixels across)
function paintImageSegment(image, rowIndex, rowOffset) {
  const segmentSize = image.height / 7;
  const canvasSegmentWidth = canvasWidth / 14;
  const canvasSegmentHeight = canvasHeight / 9;
  const canvasOffset = (canvasWidth / 234) * rowOffset;

  // Note that when rendering the sprites in pieces we need to be careful about pixel rounding, as
  // otherwise the browser will do it for us, and sometimes leave gaps.

  // Top part is tiles 1-2 out of 7 in game
  // Middle part is tiles 3-5 out of 7 in game
  // Bottom part is tiles 6-7 out of 7 in game
  if (rowIndex === 0) {
    ctx.drawImage(image,
      0, 0,
      image.width, segmentSize * 2,
      canvasOffset, Math.floor(canvasSegmentHeight),
      canvasSegmentWidth * 6, Math.ceil(canvasSegmentHeight * 2));
  } else if (rowIndex === 1) {
    ctx.drawImage(image,
      0, segmentSize * 2,
      image.width, segmentSize * 3,
      canvasOffset, Math.floor(canvasSegmentHeight * 3),
      canvasSegmentWidth * 6, Math.ceil(canvasSegmentHeight * 3));
  } else {
    ctx.drawImage(image,
      0, segmentSize * 5,
      image.width, segmentSize * 2,
      canvasOffset, Math.floor(canvasSegmentHeight * 6),
      canvasSegmentWidth * 6, Math.ceil(canvasSegmentHeight * 2));
  }
}

class InteractiveGameHandler {
  render() {
    ctx.fillStyle = '000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
    const stage = imageMap.get('background');
    ctx.drawImage(stage, 0, 0, canvasWidth, canvasHeight);

    for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
      const rowOffset = rowOffsets[rowIndex];
      const rowModOffset = rowOffset % REPEAT_SIZE;

      // The idea here is to repeat the rendering to ensure there is always something on screen.
      // We could be slightly more efficient with the different directions to cut one loop.
      for (let renderRep = -1; renderRep <= 1; renderRep++) {
        for (let matchIndex = 0; matchIndex < matchData.length; matchIndex++) {
          const beforeOffset = rowModOffset + (renderRep * REPEAT_SIZE) + RENDER_OFFSET;
          const imageOffset = IMAGE_OFFSET * matchIndex;
          paintImageSegment(matchData[matchIndex].image, rowIndex, beforeOffset + imageOffset);
        }
      }
    }

    const border = imageMap.get('border');
    ctx.drawImage(border, 0, 0, canvasWidth, canvasHeight);
  }

  updateState(timePassed) {
    for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
      let newOffset = rowOffsets[rowIndex];
      newOffset += (rowSpeeds[rowIndex] * timePassed);
      rowOffsets[rowIndex] = newOffset;
    }

    if (isSlowing) {
      let shouldStop = false;
      if (rowSpeeds[currentRowIndex] < 0 && rowOffsets[currentRowIndex] < slowDestination) {
        shouldStop = true;
      } else if (rowSpeeds[currentRowIndex] > 0 && rowOffsets[currentRowIndex] > slowDestination) {
        shouldStop = true;
      }

      if (shouldStop) {
        isSlowing = false;
        rowOffsets[currentRowIndex] = slowDestination; // Put it at the exact right spot
        rowSpeeds[currentRowIndex] = 0;

        if (currentRowIndex < 2) {
          currentRowIndex++;
        } else {
          // Check for win
        }
      }
    }
  }

  interact() {
    if (isSlowing) {
      return;
    }

    isSlowing = true;
    rowSpeeds[currentRowIndex] *= SLOWING_SPEED_MULT;

    // determine the midpoint where we want to stop, and store the match data

    const rowOffset = (rowOffsets[currentRowIndex] + RENDER_OFFSET) % REPEAT_SIZE;

    if (rowSpeeds[currentRowIndex] < 0) { // If moving left
      const nextIndex = Math.floor(rowOffset / IMAGE_OFFSET); // negative index
      const rowBase = rowOffsets[currentRowIndex] - (rowOffsets[currentRowIndex] % REPEAT_SIZE);

      slowDestination = nextIndex * IMAGE_OFFSET + rowBase;
      rowMatches[currentRowIndex] = matchData[nextIndex];
    } else {
      const nextIndex = Math.ceil(rowOffset / IMAGE_OFFSET);
      const rowBase = rowOffsets[currentRowIndex] - (rowOffsets[currentRowIndex] % REPEAT_SIZE);

      slowDestination = nextIndex * IMAGE_OFFSET + rowBase;
      rowMatches[currentRowIndex] = matchData[nextIndex];
    }
  }
}

function gameRender(newTimestamp) {
  // Calculate time passed
  let timePassed = lastTimestamp ? (newTimestamp - lastTimestamp) : 0;
  lastTimestamp = newTimestamp;

  // Update the game state
  currentGameHandler.updateState(timePassed);

  // Render
  currentGameHandler.render();

  // Request next frame
  if (pageVisible) {
    window.requestAnimationFrame(gameRender);
  }
}

// Twitch events
const refreshTokenExpireTime = (30 * 24 * 60 * 60 * 1000); // 30 days

function setError(errMsg) {
  console.error(errMsg);
  document.getElementById('errorDiv').textContent = errMsg;
}

function clearError() {
  document.getElementById('errorDiv').textContent = '';
}

class EventIdCache {
  constructor(maxItems = 100) {
    this.maxItems = maxItems;
    this.cache = new Set();
  }

  test(key) {
    let existed = this.cache.delete(key);
    this.cache.add(key);
    if (existed) {
      return true;
    }

    if (this.cache.size > this.maxItems) {
      this.cache.delete(this.cache.values().next().value);
    }
    return false;
  }
}

const eventIdCache = new EventIdCache();

let deviceCode = null;
let refreshToken = null;
let accessToken = null;
let accessTokenRefreshTimeout = null;
let twitchUserId = null;
let websocket = null;
let websocketTimeoutSeconds = null
let websocketTimeout = null;
let websocketSessionId = null;

function twitchTimeoutHandler() {
  console.log(`Reached Twitch's defined timeout of ${websocketTimeoutSeconds}, attempting reconnect`);
  websocket.close();
  websocketTimeoutSeconds = null;
  websocketTimeout = null;
  websocketSessionId = null;
  websocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
}

function connectWebsocket() {
  websocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

  websocket.addEventListener('open', (_event) => {
    console.log('Connected to Twitch events');
  });
  
  websocket.addEventListener('close', (event) => {
    setError(`Received websocket close from Twitch with code ${event.code} and reason ${event.reason} (try refreshing the page)`);
    clearTimeout(websocketTimeout);
    websocketTimeoutSeconds = null;
    websocketTimeout = null;
    websocketSessionId = null;
  });
  
  websocket.addEventListener('message', (event) => {
    const eventData = JSON.parse(event.data);

    console.log(`Twitch event: ${JSON.stringify(eventData)}`);
    if (websocketTimeout) {
      clearTimeout(websocketTimeout);
      websocketTimeout = setTimeout(twitchTimeoutHandler, websocketTimeoutSeconds * 1000);
    }
  
    if (eventIdCache.test(eventData.metadata.message_id)) {
      console.log(`Ignoring message with ID "${eventData.metadata.message_id}", as it has been seen before`);
      return;
    }
  
    if (eventData.metadata.message_type === 'session_keepalive') {
      return;
    }

    if (eventData.metadata.message_type === 'session_welcome') {
      websocketTimeoutSeconds = eventData.payload.session.keepalive_timeout_seconds;
      websocketSessionId = eventData.payload.session.id;

      console.log(`Received session_welcome. Starting keepalive timeout for ${websocketTimeoutSeconds} seconds.`);

      clearTimeout(websocketTimeout);
      websocketTimeout = setTimeout(twitchTimeoutHandler, websocketTimeoutSeconds * 1000);

      subscribeToRedeems();

    } else if (eventData.metadata.message_type === 'session_reconnect') {
      clearTimeout(websocketTimeout);
      websocketTimeoutSeconds = null;
      websocketTimeout = null;
      websocketSessionId = null;

      websocket = new WebSocket(eventData.payload.session.reconnect_url);
    } else if (eventData.metadata.message_type === 'notification') {
      if (eventData.payload.event.reward.title === twitchRewardTitle) {
        handleInteraction();
      }
    }
  });
}

function subscribeToRedeems() {
  const postData = {
    type: 'channel.channel_points_custom_reward_redemption.add',
    version: '1',
    condition: {
      broadcaster_user_id: twitchUserId
    },
    transport: {
      method: 'websocket',
      session_id: websocketSessionId
    }
  }
  fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Client-Id': twitchAppClientId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData)
  }).then((resp) => {
    return resp.json();
  }).then((respJson) => {
    if (respJson.status) {
      setError(`Request to subscribe to channel points redeems failed with: ${respJson.message}`);
    } else {
      console.log('Successfully subscribed for channel points redeems');
    }
  }).catch((e) => {
    setError(`Request to subscribe to channel points redeems failed with: ${e.message}`);
  });
}

function userAuthCompleteCallback() {
  document.getElementById('authDiv').style.display = 'none';
  requestAccessToken();
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
      if (respJson.status === 400 && respJson.message === 'authorization_pending') {
        setError(`You need to authorize the app in the other tab.`);
      } else {
        setError(`Request to get Twitch device code failed with: ${respJson.message}`);
      }
    } else {
      deviceCode = respJson.device_code;

      document.getElementById('userAuthComplete').addEventListener('click', userAuthCompleteCallback);
      document.getElementById('authTwitchAnchor').href = respJson.verification_uri;
      document.getElementById('authDiv').style.display = '';
    }
  }).catch((e) => {
    setError(`Request to get Twitch auth failed with: ${e.message}`);
  });
}

function requestAccessToken() {
  const formData = new FormData();
  formData.set('client_id', twitchAppClientId);
  formData.set('scopes', 'channel:read:redemptions');
  formData.set('device_code', deviceCode);
  formData.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');

  fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: formData,
    headers: {
      'Accept': 'application/json'
    }
  }).then((resp) => {
    return resp.json();
  }).then((respJson) => {
    if (respJson.status) {
      setError(`Request to get Twitch auth token failed with: ${respJson.message}`);
    } else {
      clearError();

      accessToken = respJson.access_token;
      refreshToken = respJson.refresh_token;

      const timeNow = new Date().getTime();
      localStorage.setItem('smb3AccessToken', accessToken);
      localStorage.setItem('smb3AccessTokenExpireTime', timeNow + (respJson.expires_in * 1000));
      localStorage.setItem('smb3RefreshToken', refreshToken);
      localStorage.setItem('smb3RefreshTokenExpireTime', timeNow + refreshTokenExpireTime); // Not in response

      document.getElementById('authDiv').style.display = '';

      getTwitchUserId();
    }
  }).catch((e) => {
    setError(`Request to get Twitch auth failed with: ${e.message}`);
  });
}

function getTwitchUserId() {
  fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(twitchUserName)}`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Client-Id': twitchAppClientId,
      'Content-Type': 'application/json',
    },
  }).then((resp) => {
    return resp.json();
  }).then((respJson) => {
    if (respJson.status) {
      setError(`Request to get user information from Twitch failed with: ${respJson.message}`);
    } else {
      clearError();

      twitchUserId = respJson.data[0].id;
      console.log('Retrieved Twitch user ID');
      connectWebsocket();
    }
  }).catch((e) => {
    setError(`Request to get user information from Twitch failed with: ${e.message}`);
  });
}

function refreshAccessToken() {
  // TODO
}

if (twitchEnabled) {
  // Try to load existing tokens up
  const refreshTokenStorage = localStorage.getItem('smb3RefreshToken');
  const refreshTokenTimeStorage = localStorage.getItem('smb3RefreshTokenExpireTime');
  const accessTokenStorage = localStorage.getItem('smb3AccessToken');
  const accessTokenExpireTimeStorage = localStorage.getItem('smb3AccessTokenExpireTime');

  const currentTime = new Date().getTime();

  if (refreshTokenStorage && refreshTokenTimeStorage && currentTime < Number(refreshTokenTimeStorage)) {
    refreshToken = refreshTokenStorage;
  }
  if (accessTokenStorage && accessTokenExpireTimeStorage && currentTime < Number(accessTokenExpireTimeStorage)) {
    accessToken = accessTokenStorage;
  }

  if (accessToken) {
    accessTokenRefreshTimeout = setTimeout(refreshAccessToken, Number(refreshTokenTimeStorage) - currentTime);
    getTwitchUserId();
  } else if (refreshToken) {
    refreshAccessToken();
  } else {
    requestDeviceCode();
  }
}