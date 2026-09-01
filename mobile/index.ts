import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widgets/widgetTaskHandler';
import App from './App';

if (Platform.OS === 'android') {
  registerWidgetTaskHandler(widgetTaskHandler);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);
