class UIClassFactory {
  getEntityClass = function (entity_id) {
    const [domain] = entity_id.split(".");

    switch (domain) {
      case "light":
        return Light;
      case "switch":
        return Switch;
      case "cover":
        return Cover;
      case "media_player":
        return MediaPlayer;
      case "climate":
        return Climate;
      case "scene":
        return Scene;
      default:
        return Unsupported;
    }
  };
}
