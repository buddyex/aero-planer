import { useEffect, useState, type FormEvent } from 'react';
import { useMap } from 'react-leaflet';
import './MapLocationSearch.css';

export interface MapSearchTarget {
  lat: number;
  lon: number;
  label: string;
}

interface MapFlyToProps {
  target: MapSearchTarget | null;
  zoom?: number;
}

export function MapFlyTo({ target, zoom = 11 }: MapFlyToProps) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lon], zoom, { duration: 1.2 });
  }, [map, target, zoom]);

  return null;
}

interface MapLocationSearchProps {
  onSearchResult: (target: MapSearchTarget) => void;
}

export function MapLocationSearch({ onSearchResult }: MapLocationSearchProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setError(null);

    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', trimmed);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('accept-language', 'ru');

      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Сервис поиска недоступен.');
      }

      const results: Array<{ lat: string; lon: string; display_name: string }> =
        await response.json();

      if (!results.length) {
        setError('Место не найдено. Уточните запрос.');
        return;
      }

      const [hit] = results;
      onSearchResult({
        lat: Number(hit.lat),
        lon: Number(hit.lon),
        label: hit.display_name,
      });
    } catch {
      setError('Не удалось выполнить поиск. Проверьте подключение к сети.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="map-location-search-wrap">
      <form className="map-location-search" onSubmit={handleSubmit}>
        <input
          type="search"
          className="map-location-search__input"
          placeholder="Поиск на карте: город, адрес…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Поиск места на карте"
        />
        <button
          type="submit"
          className="btn btn--ghost map-location-search__btn"
          disabled={isSearching || !query.trim()}
        >
          {isSearching ? '…' : 'Найти'}
        </button>
      </form>
      {error && (
        <p className="map-location-search__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
