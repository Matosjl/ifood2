# Wrapper WebView — App do Garçom (React / Expo)

## Objetivo
Criar um "app nativo leve" que apenas encapsule o Painel do Restaurante (`PainelPedidosRestaurante.jsx`) em uma WebView full-screen. Isso evita manter 2 codebases e permite atualizações instantâneas via deploy do frontend.

## Stack Recomendada
- **Expo** (managed workflow) — gera APK/IPA sem Android Studio/Xcode.
- **expo-webview** — componente `WebView` otimizado.
- **expo-notifications** — para push nativo quando chegar pedido novo.

## Estrutura Mínima

```bash
npx create-expo-app GarcomApp --template blank
cd GarcomApp
npx expo install expo-webview expo-notifications expo-constants
```

## Código base (`App.js`)

```jsx
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

// URL do painel do restaurante (pode vir de uma variável de ambiente no Expo)
const PAINEL_URL = 'https://sua-vps.com/painel-garcom';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const webviewRef = useRef(null);

  useEffect(() => {
    // Solicita permissão de push no primeiro acesso
    if (Platform.OS !== 'web') {
      Notifications.requestPermissionsAsync();
    }
  }, []);

  // Injeta JS para receber eventos do frontend React (postMessage)
  const injectedJS = `
    window.isGarcomApp = true;
    document.addEventListener('novoPedido', function(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({type: 'novoPedido', data: e.detail}));
    });
    true;
  `;

  const handleMessage = (event) => {
    const msg = JSON.parse(event.nativeEvent.data);
    if (msg.type === 'novoPedido') {
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Novo pedido recebido!',
          body: \`Pedido #\${msg.data.pedidoId}\`,
          sound: 'default',
        },
        trigger: null, // imediato
      });
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: PAINEL_URL }}
        style={styles.webview}
        injectedJavaScript={injectedJS}
        onMessage={handleMessage}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
      />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, marginTop: Platform.OS === 'ios' ? 40 : 0 },
});
```

## Como funciona a comunicação
1. **Frontend React** dispara evento customizado quando chega pedido novo via WebSocket:
   ```js
   document.dispatchEvent(new CustomEvent('novoPedido', { detail: pedido }));
   ```
2. **WebView** injeta um listener que captura esse evento e envia para o React Native via `postMessage`.
3. **Expo Notifications** recebe a mensagem e dispara notificação push nativa (som + badge).

## Otimizações para Produção
- **Deep Links**: Configure `expo-linking` para abrir o app direto em telas específicas (`/pedido/:id`).
- **Offline**: Adicione `expo-updates` para OTA updates do bundle nativo.
- **Cache**: Ative `cacheEnabled` na WebView para reduzir tráfego de rede.
- **Fullscreen**: Use `expo-navigation-bar` para esconder barras do sistema em tablets de restaurante.

## Build para Loja
```bash
# Android APK
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease

# iOS (requer Mac + conta dev)
npx expo prebuild --platform ios
```

Ou use **EAS Build** (cloud):
```bash
npm install -g eas-cli
eas build --platform android --profile production
```

## Segurança
- Restrinja `PAINEL_URL` ao domínio da sua VPS.
- Adicione autenticação via token JWT injetado no `localStorage` da WebView:
  ```js
  injectedJavaScript={`localStorage.setItem('garcom_token', '${jwtToken}'); true;`}
  ```

