import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import App from './App';

if (Platform.OS === 'android') {
  registerWidgetTaskHandler(async (props) => {
    const { widgetTaskHandler } = await import('./src/widgets/widgetTaskHandler');
    return widgetTaskHandler(props);
  });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);
