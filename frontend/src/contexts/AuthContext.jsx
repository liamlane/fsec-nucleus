import { createContext, useContext, useState, useEffect } from 'react';

const AuthCtx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('nucleus_token'));

  const login = (tok) => {
    localStorage.setItem('nucleus_token', tok);
    setToken(tok);
  };

  const logout = () => {
    localStorage.removeItem('nucleus_token');
    setToken(null);
  };

  // Cross-tab sync — if the token is removed in another tab (logout) or
  // changed in another tab (new login), reflect it here.
  // The 'storage' event fires only in other tabs, not the one that wrote.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'nucleus_token') {
        setToken(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return <AuthCtx.Provider value={{ token, login, logout, isAuth: !!token }}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
