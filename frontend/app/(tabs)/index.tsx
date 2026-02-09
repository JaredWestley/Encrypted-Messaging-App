import { Redirect } from 'expo-router';
import { useAuth } from './utils/AuthContext';

export default function Index() {
  const { token } = useAuth();
  
  if (token) {
    return <Redirect href="/App" />;
  }
  
  return <Redirect href="/pages/Login" />;
}