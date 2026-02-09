// import React from "react";
// import { NavigationContainer } from "@react-navigation/native";
// import { createNativeStackNavigator } from "@react-navigation/native-stack";
// import { StatusBar } from "expo-status-bar";
// import { TamaguiProvider } from "tamagui";
// import LoginPage from "./pages/LoginPage";
// import RegisterPage from "./pages/RegisterPage";
// import ChatPage from "./pages/ChatPage";
// import { AuthProvider } from "./utils/AuthContext";
// // import config from "./Tamagui.config";
// import config from "../../tamagui.config";

// const Stack = createNativeStackNavigator();

// const App: React.FC = () => {
//   return (
//     <TamaguiProvider config={config} defaultTheme="dark">
//       <AuthProvider>
//         <NavigationContainer>
//           <StatusBar style="light" />
//           <Stack.Navigator
//             initialRouteName="Login"
//             screenOptions={{
//               headerShown: false,
//               contentStyle: { backgroundColor: "#36393f" },
//             }}
//           >
//             <Stack.Screen name="Login" component={LoginPage} />
//             <Stack.Screen name="Register" component={RegisterPage} />
//             <Stack.Screen name="Chat" component={ChatPage} />
//           </Stack.Navigator>
//         </NavigationContainer>
//       </AuthProvider>
//     </TamaguiProvider>
//   );
// };

// export default App;


import { Redirect } from 'expo-router';
import { useAuth } from './utils/AuthContext';

export default function Index() {
  const { token } = useAuth();
  
  if (token) {
    return <Redirect href="/(tabs)/pages/Chat" />;
  }
  
  return <Redirect href="/(tabs)/pages/Login" />;
}