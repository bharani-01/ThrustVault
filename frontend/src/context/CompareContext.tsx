import React, { createContext, useContext, useState } from 'react';

export type CompareType = 'motor' | 'esc' | 'propeller';

interface CompareContextType {
  comparedIds: string[];
  compareType: CompareType | null;
  toggleCompare: (id: string, type: CompareType) => void;
  removeCompare: (id: string) => void;
  clearCompare: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
}

const CompareContext = createContext<CompareContextType | undefined>(undefined);

export const CompareProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [comparedIds, setComparedIds] = useState<string[]>([]);
  const [compareType, setCompareType] = useState<CompareType | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleCompare = (id: string, type: CompareType) => {
    setComparedIds(prev => {
      // If we change type, reset comparison selection
      if (compareType !== type) {
        setCompareType(type);
        setDrawerOpen(true);
        return [id];
      }

      if (prev.includes(id)) {
        const next = prev.filter(item => item !== id);
        if (next.length === 0) {
          setCompareType(null);
          setDrawerOpen(false);
        }
        return next;
      }

      // Limit comparison to 3 items
      if (prev.length >= 3) {
        alert('You can compare a maximum of 3 items at a time.');
        return prev;
      }

      setDrawerOpen(true);
      return [...prev, id];
    });
  };

  const removeCompare = (id: string) => {
    setComparedIds(prev => {
      const next = prev.filter(item => item !== id);
      if (next.length === 0) {
        setCompareType(null);
        setDrawerOpen(false);
      }
      return next;
    });
  };

  const clearCompare = () => {
    setComparedIds([]);
    setCompareType(null);
    setDrawerOpen(false);
  };

  return (
    <CompareContext.Provider 
      value={{ 
        comparedIds, 
        compareType, 
        toggleCompare, 
        removeCompare, 
        clearCompare,
        drawerOpen,
        setDrawerOpen
      }}
    >
      {children}
    </CompareContext.Provider>
  );
};

export const useCompare = () => {
  const context = useContext(CompareContext);
  if (context === undefined) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
};
