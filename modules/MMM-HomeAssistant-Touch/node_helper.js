const NodeHelper = require("node_helper");
const HomeAssistant = require("homeassistant");
const HomeAssistantWS = require("homeassistant-ws");
const Logger = require("./helpers/Logger");

module.exports = NodeHelper.create({
  start,
  stop,
  socketNotificationReceived,
  connect,
  connectWs,
  getState,
  toggleState,
  setCoverPosition,
  setMediaPlayerVolume,
  setLightBrightness,
  climateSetTemperature,
  climateSetHvac,
  mediaPlayerPlayPause,
  mediaPlayerNext,
  mediaPlayerPrevious,
  activateScene,
  onStateChangedEvent,
  enrichMediaState,
});

function start() {
  this.logger = new Logger(this.name);
  this.connections = {};
  this.artCache = new Map();
}

function stop() {
  for (const connection in this.connections) {
    try {
      this.connections[connection]?.websocket?.unsubscribeFromEvent?.(
        "state_changed"
      );
    } catch (err) {
      this.logger.debug(`WS cleanup: ${err.message}`);
    }
  }
}

function socketNotificationReceived(notification, payload) {
  if (notification === "CONNECT") {
    this.logger.debug(`Recieved notification ${notification}`);
  } else {
    this.logger.debug(`Recieved notification ${notification}`, {
      identifier: payload?.identifier,
      entity: payload?.entity
    });
  }
  if (
    notification !== "CONNECT" &&
    (!payload.identifier || !this.connections[payload.identifier])
  ) {
    this.logger.error(`No connection for ${payload.identifier} found`);
    return;
  }

  switch (notification) {
    case "CONNECT":
      this.connect(payload);
      break;
    case "GET_STATE":
      this.getState(payload);
      break;
    case "TOGGLE_STATE":
      this.toggleState(payload);
      break;
    case "SET_COVER_POSITION":
      this.setCoverPosition(payload);
      break;
    case "SET_MEDIAPLAYER_VOLUME":
      this.setMediaPlayerVolume(payload);
      break;
    case "SET_LIGHT_BRIGHTNESS":
      this.setLightBrightness(payload);
      break;
    case "CLIMATE_SET_TEMPERATURE":
      this.climateSetTemperature(payload);
      break;
    case "CLIMATE_SET_HVAC":
      this.climateSetHvac(payload);
      break;
    case "MEDIA_PLAYER_PLAYPAUSE":
      this.mediaPlayerPlayPause(payload);
      break;
    case "MEDIA_PLAYER_PREVIOUS":
      this.mediaPlayerPrevious(payload);
      break;
    case "MEDIA_PLAYER_NEXT":
      this.mediaPlayerNext(payload);
      break;
    case "ACTIVATE_SCENE":
      this.activateScene(payload);
      break;
  }
}

async function connect(payload) {
  const connectionConfig = {
    host: payload.host,
    port: payload.port,
    token: payload.token,
    ignoreCert: payload.ignoreCert,
  };
  const hass = new HomeAssistant(connectionConfig);
  this.logger.info(`HomeAssistant connected for ${payload.identifier}`);
  this.connections[payload.identifier] = {
    hass,
    entities: [],
  };

  this.connectWs(connectionConfig, payload)
}

async function connectWs(connectionConfig, payload) {
  const self = this;
  HomeAssistantWS.default({
    ...connectionConfig,
    host: new URL(connectionConfig.host).host,
  })
    .then((hassWs) => {
      this.connections[payload.identifier].websocket = hassWs;
      hassWs.on("state_changed", onStateChangedEvent.bind(self));
      hassWs.on('ws_close', () => {
        this.logger.debug(`Lost connection for ${payload.identifier}... Trying to reconnect in 2secs`)
        setTimeout(() => {
          this.connectWs(connectionConfig, payload)
        }, 2000)
      })
    })
    .catch((err) => {
      this.logger.error(
        `WS connection for ${payload.identifier} failed...`
      );
      this.logger.debug(`Trying to reconnect for ${payload.identifier} in 2secs`)
      setTimeout(() => {
        this.connectWs(connectionConfig, payload)
      }, 2000)
    });
}

async function getState(payload) {
  this.logger.debug(`Getting state for ${payload.entity}`);
  const hass = this.connections[payload.identifier].hass;
  const [domain, entity] = payload.entity.split(".");
  const response = await hass.states.get(domain, entity);
  const data = await this.enrichMediaState(response);
  this.sendSocketNotification("GOT_STATE", {
    identifier: payload.identifier,
    data,
  });

  if (!this.connections[payload.identifier].entities.includes(payload.entity)) {
    this.connections[payload.identifier].entities.push(payload.entity);
  }
}

async function toggleState(payload) {
  this.logger.debug(`Toggling state for ${payload.entity}`);
  const hass = this.connections[payload.identifier].hass;
  const [domain, entity] = payload.entity.split(".");
  await hass.services.call("toggle", domain, entity);
  this.getState(payload);
}

async function setCoverPosition(payload) {
  this.logger.debug(
    `Setting position for cover ${payload.entity} to ${payload.position}`
  );
  const hass = this.connections[payload.identifier].hass;
  await hass.services.call("set_cover_position", "cover", {
    entity_id: payload.entity,
    position: payload.position,
  });
  this.getState(payload);
}

async function setMediaPlayerVolume(payload) {
  this.logger.debug(
    `Setting volume for media_player ${payload.entity} to ${payload.volume_level}`
  );
  const hass = this.connections[payload.identifier].hass;
  await hass.services.call("volume_set", "media_player", {
    entity_id: payload.entity,
    volume_level: payload.volume_level,
  });
}

async function setLightBrightness(payload) {
  const pct = Math.max(1, Math.min(100, Number(payload.brightness_pct) || 1));
  this.logger.debug(`Setting brightness for ${payload.entity} to ${pct}%`);
  const hass = this.connections[payload.identifier].hass;
  await hass.services.call("turn_on", "light", {
    entity_id: payload.entity,
    brightness_pct: pct,
  });
  this.getState(payload);
}

async function climateSetTemperature(payload) {
  const temperature = Number(payload.temperature);
  this.logger.debug(
    `Setting climate temperature for ${payload.entity} to ${temperature}`
  );
  const hass = this.connections[payload.identifier].hass;
  await hass.services.call("set_temperature", "climate", {
    entity_id: payload.entity,
    temperature,
  });
  this.getState(payload);
}

async function climateSetHvac(payload) {
  this.logger.debug(
    `Setting climate hvac for ${payload.entity} to ${payload.hvac_mode}`
  );
  const hass = this.connections[payload.identifier].hass;
  await hass.services.call("set_hvac_mode", "climate", {
    entity_id: payload.entity,
    hvac_mode: payload.hvac_mode,
  });
  this.getState(payload);
}

async function mediaPlayerPlayPause(payload) {
  this.logger.debug(`Play/Pause for media_player ${payload.entity}`);
  const hass = this.connections[payload.identifier].hass;
  await hass.services.call("media_play_pause", "media_player", {
    entity_id: payload.entity
  });
}

async function mediaPlayerNext(payload) {
  this.logger.debug(`Next for media_player ${payload.entity}`);
  const hass = this.connections[payload.identifier].hass;
  await hass.services.call("media_next_track", "media_player", {
    entity_id: payload.entity
  });
}

async function mediaPlayerPrevious(payload) {
  this.logger.debug(`Previous for media_player ${payload.entity}`);
  const hass = this.connections[payload.identifier].hass;
  await hass.services.call("media_previous_track", "media_player", {
    entity_id: payload.entity
  });
}

async function activateScene(payload) {
  this.logger.debug(`Activate scene ${payload.entity}`);
  const hass = this.connections[payload.identifier].hass;
  await hass.services.call("turn_on", "scene", {
    entity_id: payload.entity
  });
}


function onStateChangedEvent(event) {
  for (const connection in this.connections) {
    if (this.connections[connection].entities.includes(event.data.entity_id)) {
      this.logger.debug(
        `Found listening connection (${connection}) for entity ${event.data.entity_id}`
      );
      const self = this;
      this.enrichMediaState(event.data.new_state).then((data) => {
        self.sendSocketNotification("CHANGED_STATE", {
          identifier: connection,
          data,
        });
      });
    }
  }
}

/**
 * Resolve album art when HA media_player_proxy is missing/404.
 * Order: absolute entity_picture → YouTube thumb → iTunes search.
 */
async function enrichMediaState(state) {
  if (!state || !state.entity_id || !state.entity_id.startsWith("media_player.")) {
    return state;
  }
  const attrs = state.attributes || {};
  let artUrl = null;

  if (typeof attrs.entity_picture === "string" && /^https?:\/\//i.test(attrs.entity_picture)) {
    artUrl = attrs.entity_picture;
  }

  const contentId = attrs.media_content_id;
  if (!artUrl && typeof contentId === "string" && /^[\w-]{11}$/.test(contentId)) {
    artUrl = `https://i.ytimg.com/vi/${contentId}/hqdefault.jpg`;
  }

  const title = attrs.media_title;
  const artist = attrs.media_artist || "";
  if (!artUrl && title) {
    const cacheKey = `${artist}|${title}`.toLowerCase();
    if (this.artCache.has(cacheKey)) {
      artUrl = this.artCache.get(cacheKey);
    } else {
      try {
        const q = encodeURIComponent([artist, title].filter(Boolean).join(" "));
        const res = await fetch(
          `https://itunes.apple.com/search?term=${q}&media=music&limit=1`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (res.ok) {
          const data = await res.json();
          const small = data.results?.[0]?.artworkUrl100;
          if (small) {
            artUrl = String(small)
              .replace("100x100bb", "600x600bb")
              .replace("100x100", "600x600");
            this.artCache.set(cacheKey, artUrl);
          }
        }
      } catch (err) {
        this.logger.debug(`Art lookup failed for ${title}: ${err.message}`);
      }
    }
  }

  if (!artUrl) {
    return state;
  }

  return {
    ...state,
    attributes: {
      ...attrs,
      resolved_art_url: artUrl,
    },
  };
}
