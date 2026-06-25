'use client';
import { useState, useEffect } from 'react';

export type NavLinkItem = {
  name: string;
  href: string;
};

export function useFavoritesAndRecents() {
  const [favorites, setFavorites] = useState<NavLinkItem[]>([]);
  const [recents, setRecents] = useState<NavLinkItem[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedFavs = localStorage.getItem('ops_favorites');
      if (storedFavs) {
        setFavorites(JSON.parse(storedFavs));
      }

      const storedRecents = localStorage.getItem('ops_recents');
      if (storedRecents) {
        setRecents(JSON.parse(storedRecents));
      }
    } catch (e) {
      console.error('Failed to load favorites/recents:', e);
    }
  }, []);

  const toggleFavorite = (item: NavLinkItem) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.href === item.href);
      let updated;
      if (exists) {
        updated = prev.filter(f => f.href !== item.href);
      } else {
        updated = [...prev, item];
      }
      localStorage.setItem('ops_favorites', JSON.stringify(updated));
      return updated;
    });
  };

  const addRecent = (item: NavLinkItem) => {
    // Exclude basic auth/landing routes or if name is empty
    if (!item.name || !item.href || item.href === '/login' || item.href === '/landing' || item.href === '/') {
      return;
    }
    setRecents(prev => {
      // Remove if already exists so we can move it to the front
      const filtered = prev.filter(r => r.href !== item.href);
      const updated = [item, ...filtered].slice(0, 5); // limit to 5 recents
      localStorage.setItem('ops_recents', JSON.stringify(updated));
      return updated;
    });
  };

  const clearRecents = () => {
    setRecents([]);
    localStorage.removeItem('ops_recents');
  };

  const isFavorite = (href: string) => {
    return favorites.some(f => f.href === href);
  };

  return {
    favorites,
    recents,
    toggleFavorite,
    addRecent,
    clearRecents,
    isFavorite,
  };
}
