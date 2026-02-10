import { Redirect } from 'expo-router';
import { useAuth } from './utils/AuthContext';
import { YStack, Spinner } from 'tamagui';

export default function App() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <YStack flex={1} backgroundColor="#36393f" justifyContent="center" alignItems="center">
        <Spinner color="white" size="large" />
      </YStack>
    );
  }

  if (token) {
    return <Redirect href="/pages/Chat" />;
  }

  return <Redirect href="/pages/Login" />;
}
