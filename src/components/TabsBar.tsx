import React, { useEffect, useRef, useState } from 'react';
import { IconPlus, IconX } from './Icons';
import { useI18n } from '../i18n/I18nProvider';

export type TabMeta = {
  id: string;
  title: string;
  hasError: boolean;
};

export function TabsBar({
  tabs,
  activeId,
  onSelect,
  onAdd,
  onClose,
}: {
  tabs: TabMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
}) {
  const { t } = useI18n();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenu) setContextMenu(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  useEffect(() => {
    if (activeId && activeTabRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const tab = activeTabRef.current;

      const tabLeft = tab.offsetLeft;
      const tabRight = tabLeft + tab.offsetWidth;
      const containerScrollLeft = container.scrollLeft;
      const containerWidth = container.offsetWidth;

      if (tabLeft < containerScrollLeft) {
         container.scrollTo({ left: tabLeft - 20, behavior: 'smooth' });
      } else if (tabRight > containerScrollLeft + containerWidth) {
         container.scrollTo({ left: tabRight - containerWidth + 20, behavior: 'smooth' });
      }
    }
  }, [activeId]);

  const handleWheel = (e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
      if (e.deltaY !== 0) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const handleCloseAction = (action: 'others' | 'left' | 'right' | 'all') => {
    if (!contextMenu) return;
    const targetId = contextMenu.tabId;
    const targetIndex = tabs.findIndex((t) => t.id === targetId);
    if (targetIndex === -1 && action !== 'all') return;

    const idsToClose: string[] = [];

    if (action === 'others') {
      tabs.forEach((t) => {
        if (t.id !== targetId) idsToClose.push(t.id);
      });
    } else if (action === 'left') {
      for (let i = 0; i < targetIndex; i++) {
        idsToClose.push(tabs[i].id);
      }
    } else if (action === 'right') {
      for (let i = targetIndex + 1; i < tabs.length; i++) {
        idsToClose.push(tabs[i].id);
      }
    } else if (action === 'all') {
      tabs.forEach((t) => idsToClose.push(t.id));
    }

    idsToClose.forEach((id) => onClose(id));
    setContextMenu(null);
  };

  const isHidden = tabs.length <= 1;

  return (
    <>
      <div className={`modern-tabs-bar${isHidden ? ' is-hidden' : ''}`}>
        <div
          className="modern-tabs-scroll"
          ref={scrollContainerRef}
          onWheel={handleWheel}
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <button
                type="button"
                key={tab.id}
                ref={isActive ? activeTabRef : null}
                role="tab"
                aria-selected={isActive}
                className={`modern-tab-item ${
                  isActive ? 'modern-tab-active' : ''
                }`}
                onClick={() => onSelect(tab.id)}
                onContextMenu={(e) => handleContextMenu(e, tab.id)}
              >
                <div className="modern-tab-content">
                  {tab.hasError && <div className="modern-tab-error-dot" />}
                  <span className="modern-tab-text" title={tab.title}>
                    {tab.title}
                  </span>
                  {tabs.length > 1 && (
                    <div
                      role="button"
                      className="modern-tab-close"
                      title="Close Tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose(tab.id);
                      }}
                    >
                      <IconX className="close-icon-svg" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          <button
            type="button"
            className="modern-tab-add-btn"
            onClick={onAdd}
            title="New Tab"
          >
            <IconPlus className="add-icon-svg" />
          </button>
        </div>
      </div>
      {contextMenu && (
        <div
          className="tabs-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="tabs-context-menu-item"
            onClick={() => handleCloseAction('others')}
          >
            {t('tabs.closeOthers')}
          </button>
          <div className="tabs-context-menu-separator" />
          <button
            className="tabs-context-menu-item"
            onClick={() => handleCloseAction('left')}
          >
            {t('tabs.closeLeft')}
          </button>
          <button
            className="tabs-context-menu-item"
            onClick={() => handleCloseAction('right')}
          >
            {t('tabs.closeRight')}
          </button>
          <div className="tabs-context-menu-separator" />
          <button
            className="tabs-context-menu-item"
            onClick={() => handleCloseAction('all')}
          >
            {t('tabs.closeAll')}
          </button>
        </div>
      )}
    </>
  );
}
