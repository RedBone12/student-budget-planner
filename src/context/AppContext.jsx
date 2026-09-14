import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { loadState, saveState } from '../services/storage';
import { budgetApi } from '../services/api';
import { createInitialState, reducer } from './appState';
import { DEFAULT_CATEGORIES } from '../data/defaultData';
const AppContext = createContext(null);
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(loadState()));
  const [storageError, setStorageError] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [dataError, setDataError] = useState('');

  const connectUser = useCallback(async (user) => {
    dispatch({ type: 'LOGIN', payload: user });
    try {
      let data = await budgetApi.loadBudgetData();
      if (data.categories.length === 0) {
        const categories = await Promise.all(
          DEFAULT_CATEGORIES.map(({ name, budget }) => budgetApi.createCategory({ name, budget })),
        );
        data = { ...data, categories };
      }
      dispatch({ type: 'LOAD_REMOTE_DATA', payload: data });
      setDataError('');
    } catch (error) {
      setDataError(`AWS data could not be loaded: ${error.message}`);
    }
  }, []);

  useEffect(() => {
    let active = true;
    budgetApi.currentUser()
      .then((user) => active && connectUser(user))
      .catch(() => {})
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => { active = false; };
  }, [connectUser]);

  useEffect(() => {
    setStorageError(saveState(state) ? '' : 'Changes could not be saved in this browser. Please free storage space and try again before closing this page.');
  }, [state]);
  const value = useMemo(() => ({ state, dispatch, authReady, connectUser }), [state, authReady, connectUser]);
  return <AppContext.Provider value={value}>{(storageError || dataError) && <p role="alert" className="form-error">{storageError || dataError}</p>}{children}</AppContext.Provider>;
}
export function useApp() { return useContext(AppContext); }
