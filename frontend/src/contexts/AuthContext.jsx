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

  return <AuthCtx.Provider value={{ token, login, logout, isAuth: !!token }}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
