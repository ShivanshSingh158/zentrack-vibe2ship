const fs = require('fs');
const appJsonPath = './mobile/app.json';
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

// Android permissions
const requiredPermissions = [
  "android.permission.CAMERA",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION"
];

let permissions = appJson.expo.android.permissions || [];
for (const p of requiredPermissions) {
  if (!permissions.includes(p)) {
    permissions.push(p);
  }
}
// Remove duplicates that were already there
permissions = [...new Set(permissions)];
appJson.expo.android.permissions = permissions;

// Plugins
const plugins = appJson.expo.plugins || [];

const addPlugin = (name, config) => {
  const exists = plugins.some(p => (Array.isArray(p) && p[0] === name) || p === name);
  if (!exists) {
    if (config) plugins.push([name, config]);
    else plugins.push(name);
  }
};

addPlugin('expo-camera', {
  "cameraPermission": "ZenTrack needs access to the camera to scan barcodes and take progress photos."
});
addPlugin('expo-image-picker', {
  "photosPermission": "ZenTrack needs access to your photos to let you set a profile picture or log progress photos."
});
addPlugin('expo-location', {
  "locationAlwaysAndWhenInUsePermission": "ZenTrack needs location access to remind you to log workouts when you arrive at the gym."
});
// secure-store was already added automatically by the npm install
// background-fetch and task-manager don't require explicit plugin config entries, they just work.

appJson.expo.plugins = plugins;

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2), 'utf8');
console.log('Successfully updated app.json');
