import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FALLBACK_DATA } from './data/fallbackData';

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxEh4SumzkoJSaLmHAOldgAoSeko-leYAtF9LJjVj6Z0tkd_vIh0B9ZbEwtUcw9tCWj/exec';

const CACHE_KEY = 'menu_rows_cache_v1';
const CACHE_TTL_MS = 60 * 60 * 1000;
const MODEL_VIEW_FOV = '20deg';
const MODEL_CAMERA_ORBIT = 'auto auto auto';
const IMAGE_SIZES = '(max-width: 640px) 38vw, 210px';

const BADGES = [
  { key: 'veg', label: 'Veg', icon: '/icons/veg.svg', className: 'badge-veg' },
  { key: 'spicy', label: 'Spicy', icon: '/icons/spicy.svg', className: 'badge-spicy' },
  { key: 'chefSpecial', label: "Chef's Special", icon: '/icons/chef.svg', className: 'badge-chef' }
];

function parseYes(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .match(/^(yes|true|1)$/);
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function mapRowToDish(row, index) {
  const name = normalizeText(row['Dish Name']);
  const category = normalizeText(row.Category) || 'Menu';
  const description = normalizeText(row.Description);
  const price1 = normalizeText(row.Price1 || row['Price 1']);
  const price2 = normalizeText(row.Price2 || row['Price 2']);
  const price3 = normalizeText(row.Price3 || row['Price 3']);
  const glbUrl = normalizeText(row['3d model'] || row['3D model']);

  return {
    id: `${name || 'dish'}-${category}-${index}`,
    name: name || `Dish ${index + 1}`,
    category,
    description,
    price1,
    price2,
    price3,
    image: normalizeText(row.Image),
    glbUrl,
    hasModel: glbUrl !== '' && glbUrl.toLowerCase() !== 'sampleurl',
    veg: !!parseYes(row.Veg),
    spicy: !!parseYes(row.Spicy),
    chefSpecial: !!parseYes(row['Chef Special'])
  };
}

function groupByCategory(rows) {
  const grouped = new Map();
  const categoryOrder = [];

  rows.forEach((row, index) => {
    const dish = mapRowToDish(row, index);
    if (!dish.category) {
      return;
    }
    if (!grouped.has(dish.category)) {
      grouped.set(dish.category, []);
      categoryOrder.push(dish.category);
    }
    grouped.get(dish.category).push(dish);
  });

  return { grouped, categoryOrder };
}

function isCloudinaryUrl(url) {
  return normalizeText(url).includes('res.cloudinary.com');
}

function cldTransform(url, params = {}) {
  if (!isCloudinaryUrl(url)) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const uploadIndex = parts.findIndex((part) => part === 'upload');

    if (uploadIndex === -1) {
      return url;
    }

    const base = parts.slice(0, uploadIndex + 1).join('/');
    const rest = parts.slice(uploadIndex + 1).join('/');

    const tokens = ['f_auto', 'q_auto', 'dpr_auto', 'c_limit', params.w ? `w_${params.w}` : '']
      .filter(Boolean)
      .join(',');

    parsed.pathname = `${base}/${tokens}/${rest}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

function buildSrcSet(url, widths = [160, 240, 320, 480, 640]) {
  if (!url) {
    return '';
  }
  return widths.map((width) => `${cldTransform(url, { w: width })} ${width}w`).join(', ');
}

function getHighResImageUrl(url) {
  return cldTransform(url, { w: 1920 });
}

function getPrice(dish) {
  return [dish.price1, dish.price2, dish.price3].filter(Boolean).join('  ');
}

function skeletonSections() {
  return Array.from({ length: 3 }, (_, sectionIndex) => ({
    sectionId: `skeleton-${sectionIndex}`,
    cards: Array.from({ length: 3 }, (_, cardIndex) => `skeleton-card-${sectionIndex}-${cardIndex}`)
  }));
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.rows)) {
    return payload.rows;
  }
  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }
  return [];
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [dishesByCategory, setDishesByCategory] = useState(new Map());
  const [activeCategory, setActiveCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [modelModal, setModelModal] = useState({ open: false, dishName: '', glbUrl: '' });
  const [imageModal, setImageModal] = useState({ open: false, dishName: '', imageUrl: '' });

  const sectionRefs = useRef(new Map());
  const navRef = useRef(null);
  const modelViewerRef = useRef(null);
  const savedScrollY = useRef(0);
  const spyLockUntilRef = useRef(0);
  const spyLockTargetRef = useRef('');
  const scrollEndTimerRef = useRef(null);

  const filteredData = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    if (!normalizedQuery) {
      return { categories, dishesByCategory };
    }

    const filteredMap = new Map();
    const filteredCategories = [];

    categories.forEach((category) => {
      const dishes = dishesByCategory.get(category) || [];
      const matching = dishes.filter((dish) => {
        const searchable = [dish.name, dish.description, dish.category].join(' ').toLowerCase();
        return searchable.includes(normalizedQuery);
      });

      if (matching.length > 0) {
        filteredMap.set(category, matching);
        filteredCategories.push(category);
      }
    });

    return { categories: filteredCategories, dishesByCategory: filteredMap };
  }, [categories, dishesByCategory, searchTerm]);

  useEffect(() => {
    async function initMenu() {
      setIsLoading(true);
      let rows = [];

      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        const cachedRows = normalizeRows(cached?.rows);
        const freshEnough = cached && cachedRows.length > 0 && Date.now() - cached.ts < CACHE_TTL_MS;
        if (freshEnough) {
          rows = cachedRows;
        }
      } catch {
        rows = [];
      }

      if (rows.length === 0 && SHEET_URL) {
        try {
          const response = await fetch(SHEET_URL);
          if (!response.ok) {
            throw new Error(`Failed response: ${response.status}`);
          }
          rows = normalizeRows(await response.json());
          if (rows.length === 0) {
            throw new Error('Sheet response was not an array of rows.');
          }
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows }));
        } catch (error) {
          console.error('Failed to load Google Sheets data:', error);
          rows = FALLBACK_DATA;
        }
      }

      if (rows.length === 0) {
        rows = FALLBACK_DATA;
      }

      const { grouped, categoryOrder } = groupByCategory(rows);
      setCategories(categoryOrder);
      setDishesByCategory(grouped);
      setActiveCategory(categoryOrder[0] || '');
      setIsLoading(false);
    }

    initMenu();
  }, []);

  useEffect(() => {
    if (isLoading || filteredData.categories.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        if (now < spyLockUntilRef.current && spyLockTargetRef.current) {
          setActiveCategory(spyLockTargetRef.current);
          return;
        }

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]?.target?.dataset?.category) {
          setActiveCategory(visible[0].target.dataset.category);
        }
      },
      {
        root: null,
        rootMargin: '-30% 0px -55% 0px',
        threshold: [0.1, 0.2, 0.35, 0.5, 0.7]
      }
    );

    filteredData.categories.forEach((category) => {
      const section = sectionRefs.current.get(category);
      if (section) {
        observer.observe(section);
      }
    });

    return () => observer.disconnect();
  }, [filteredData, isLoading]);

  useEffect(() => {
    if (!modelModal.open || !modelViewerRef.current) {
      return undefined;
    }

    const viewer = modelViewerRef.current;
    const onLoad = () => {
      viewer.cameraOrbit = MODEL_CAMERA_ORBIT;
      viewer.cameraTarget = 'auto auto auto';
      viewer.fieldOfView = MODEL_VIEW_FOV;
      if (viewer.jumpCameraToGoal) {
        viewer.jumpCameraToGoal();
      }
    };

    viewer.addEventListener('load', onLoad);
    return () => viewer.removeEventListener('load', onLoad);
  }, [modelModal.open]);

  function lockScroll() {
    savedScrollY.current = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY.current}px`;
    document.body.style.width = '100%';
  }

  function unlockScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, savedScrollY.current);
  }

  async function openModelModal(dish) {
    if (!dish.hasModel) {
      return;
    }

    if (!window.customElements || !window.customElements.get('model-viewer')) {
      await import('https://cdn.jsdelivr.net/npm/@google/model-viewer@3/dist/model-viewer.min.js');
    }

    lockScroll();
    setModelModal({ open: true, dishName: dish.name, glbUrl: dish.glbUrl });
  }

  function closeModelModal() {
    setModelModal({ open: false, dishName: '', glbUrl: '' });
    unlockScroll();
    if (modelViewerRef.current?.pause) {
      modelViewerRef.current.pause();
    }
  }

  function openImageModal(dish) {
    if (!dish.image) {
      return;
    }
    lockScroll();
    setImageModal({ open: true, dishName: dish.name, imageUrl: getHighResImageUrl(dish.image) });
  }

  function closeImageModal() {
    setImageModal({ open: false, dishName: '', imageUrl: '' });
    unlockScroll();
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape') {
        return;
      }
      if (modelModal.open) {
        closeModelModal();
      }
      if (imageModal.open) {
        closeImageModal();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imageModal.open, modelModal.open]);

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current) {
        clearTimeout(scrollEndTimerRef.current);
      }
    };
  }, []);

  function scheduleSpyUnlock() {
    if (scrollEndTimerRef.current) {
      clearTimeout(scrollEndTimerRef.current);
    }

    scrollEndTimerRef.current = setTimeout(() => {
      spyLockUntilRef.current = 0;
      spyLockTargetRef.current = '';
    }, 180);
  }

  function scrollToCategory(category) {
    const lockMs = 800;
    spyLockUntilRef.current = Date.now() + lockMs;
    spyLockTargetRef.current = category;

    setActiveCategory(category);
    const section = sectionRefs.current.get(category);
    if (!section) {
      return;
    }

    const navHeight = navRef.current?.offsetHeight || 0;
    const topOffset = section.getBoundingClientRect().top + window.scrollY - navHeight - 14;
    window.scrollTo({ top: topOffset, behavior: 'smooth' });

    // Fallback unlock after expected smooth-scroll duration.
    if (scrollEndTimerRef.current) {
      clearTimeout(scrollEndTimerRef.current);
    }
    scrollEndTimerRef.current = setTimeout(() => {
      spyLockUntilRef.current = 0;
      spyLockTargetRef.current = '';
    }, lockMs + 120);

    const onScroll = () => {
      scheduleSpyUnlock();
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    setTimeout(() => {
      window.removeEventListener('scroll', onScroll);
    }, lockMs + 160);
  }

  return (
    <div className="page-shell">
      <header className="hero-bleed" aria-label="Digital Dining Menu hero">
        <div className="hero-dots" aria-hidden="true">
          <span className="hero-dot active" />
          <span className="hero-dot" />
          <span className="hero-dot" />
        </div>
        <div className="hero-copy">
          <p className="hero-kicker">Digital Dining</p>
          <h1 className="hero-title">Menu</h1>
        </div>
      </header>

      <section className="search-strip" aria-label="Search menu">
        <div className="search-strip-inner">
          <label className="search-wrap" htmlFor="menu-search">
            <span className="search-label">Search dishes</span>
            <input
              id="menu-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Try truffle, pasta, spicy..."
              className="search-input"
            />
          </label>
        </div>
      </section>

      <div className="content-wrap">
        <nav className="category-nav" ref={navRef} aria-label="Dish categories">
          <div className="category-row">
            {isLoading
              ? Array.from({ length: 5 }, (_, index) => <div className="pill-skeleton" key={`pill-skeleton-${index}`} />)
              : filteredData.categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`category-pill ${activeCategory === category ? 'active' : ''}`}
                    onClick={() => scrollToCategory(category)}
                  >
                    {category}
                  </button>
                ))}
          </div>
        </nav>

        <main className="menu-main">
          {isLoading &&
            skeletonSections().map((section) => (
              <section key={section.sectionId} className="menu-section">
                <div className="section-title-skeleton" />
                {section.cards.map((cardId) => (
                  <article key={cardId} className="dish-tile skeleton-tile">
                    <div className="skeleton-block skeleton-name" />
                    <div className="skeleton-block skeleton-desc" />
                    <div className="skeleton-block skeleton-price" />
                    <div className="skeleton-image" />
                  </article>
                ))}
              </section>
            ))}

          {!isLoading && filteredData.categories.length === 0 && (
            <section className="empty-state">
              <h2>No matching dishes</h2>
              <p>Try a different keyword or clear your search.</p>
            </section>
          )}

          {!isLoading &&
            filteredData.categories.map((category) => {
              const dishes = filteredData.dishesByCategory.get(category) || [];
              return (
                <section
                  key={category}
                  className="menu-section"
                  data-category={category}
                  ref={(node) => {
                    if (node) {
                      sectionRefs.current.set(category, node);
                    }
                  }}
                >
                  <h2 className="section-title">{category}</h2>
                  <div className="tiles-stack">
                    {dishes.map((dish) => (
                      <article className="dish-tile" key={dish.id}>
                        <div className="dish-copy">
                          <h3 className="dish-name">{dish.name}</h3>
                          {dish.description && <p className="dish-description">{dish.description}</p>}
                          <p className="dish-price">{getPrice(dish) || 'Price on request'}</p>
                          <div className="badge-row">
                            {BADGES.filter((badge) => dish[badge.key]).map((badge) => (
                              <span key={`${dish.id}-${badge.key}`} className={`badge ${badge.className}`}>
                                <img src={badge.icon} alt="" aria-hidden="true" />
                                <span>{badge.label}</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="dish-media">
                          <button
                            type="button"
                            className="dish-image-button"
                            onClick={() => (dish.hasModel ? openModelModal(dish) : openImageModal(dish))}
                            aria-label={dish.hasModel ? `View 3D model for ${dish.name}` : `View image for ${dish.name}`}
                          >
                            {dish.image ? (
                              <img
                                src={cldTransform(dish.image, { w: 420 })}
                                srcSet={buildSrcSet(dish.image)}
                                sizes={IMAGE_SIZES}
                                alt={dish.name}
                                loading="lazy"
                                className="dish-image"
                              />
                            ) : (
                              <span className="image-fallback">No image</span>
                            )}
                          </button>

                          <button
                            type="button"
                            className="ghost-3d-btn"
                            onClick={() => openModelModal(dish)}
                            disabled={!dish.hasModel}
                            aria-disabled={!dish.hasModel}
                            title={!dish.hasModel ? '3D model not available for this dish' : `Open 3D model for ${dish.name}`}
                          >
                            View in 3D
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
        </main>
      </div>

      {modelModal.open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${modelModal.dishName} 3D viewer`} onClick={closeModelModal}>
          <div className="modal-panel model-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closeModelModal} aria-label="Close 3D viewer">
              ×
            </button>
            <p className="modal-title">{modelModal.dishName}</p>
            <model-viewer
              ref={modelViewerRef}
              src={modelModal.glbUrl}
              alt={`${modelModal.dishName} 3D model`}
              ar=""
              auto-rotate=""
              camera-controls=""
              camera-orbit={MODEL_CAMERA_ORBIT}
              camera-target="auto auto auto"
              orbit-sensitivity="0.7"
              style={{ width: '100%', height: '72vh' }}
            />
          </div>
        </div>
      )}

      {imageModal.open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${imageModal.dishName} image`} onClick={closeImageModal}>
          <div className="modal-panel image-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closeImageModal} aria-label="Close image preview">
              ×
            </button>
            <img src={imageModal.imageUrl} alt={imageModal.dishName} className="modal-image" />
          </div>
        </div>
      )}
    </div>
  );
}
