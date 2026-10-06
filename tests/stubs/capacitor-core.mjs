export const Capacitor = {
  isNativePlatform: () => true,
  convertFileSrc: (uri) => `https://localhost/_capacitor_file_/${String(uri).replace(/^file:\/\//, "")}`,
  getPlatform: () => "android",
};
