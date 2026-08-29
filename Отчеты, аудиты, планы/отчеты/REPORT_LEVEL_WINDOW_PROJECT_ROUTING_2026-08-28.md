# Отчёт об устранении рассинхрона контекста окон уровней при мультипроектном виде

**Дата:** 28 августа 2026 г.  
**Компоненты:** `app/components/LevelWindow.js`, `app/components/Canvas.js`, `app/store/reducer.js`, `app/tests/projects.test.js`  
**Категория:** Исправление багов маршрутизации и стабилизация DOM (Мультипроектность, Plan V6)

---

## 1. Описание обнаруженной проблемы

При работе с несколькими параллельно открытыми проектами на общем мировом холсте (Plan V6) возникали следующие критические аномалии:

1. **Зум колесиком мыши над окнами неактивного проекта:**
   При вращении колеса мыши над окном Уровня 0 или 1 Проекта 1 (когда в приложении активен Проект 2), масштабировались и панорамировались окна Проекта 2, а окно Проекта 1 под курсором оставалось неподвижным.
2. **Телепортация и перекрытие окон при перемещении за шапку:**
   При попытке захватить и перетащить шапку окна Уровня 0 Проекта 1 окно Уровня 0 Проекта 2 мгновенно телепортировалось на координаты курсора мыши и полностью закрывало собой Проект 1 на экране.
3. **Срыв жестов при попытке активации на `mousedown` (Key-Shift Bug):**
   При попытке переключать активный проект по событию `mousedown` происходило мгновенное уничтожение (unmount) и пересоздание DOM-элементов окна прямо под зажатым пальцем пользователя из-за смены составного ключа `key={`${pid}:${win.id}`}` на `key={win.id}`.

---

## 2. Корневая причина (Root Cause Analysis)

Глубокий аудит выявил 3 взаимосвязанных фактора:

1. **Адресация экшенов по числовому `index` без `windowId`:**
   В `LevelWindow.js` обработчик колеса `handleWheel` и жесты перетаскивания шапки/ресайза вызывали экшены вида:
   ```javascript
   dispatch({ type: 'UPDATE_LEVEL_PROPERTIES', payload: { index: 0, updates: { innerZoom, innerOffset } } });
   dispatch({ type: 'MOVE_LEVEL_WINDOW', payload: { index: 0, position: latestPos } });
   ```
   Поскольку `index: 0` (Главный холст) одинаков для каждого проекта, а глобальный редьюсер `multiReducer` не получал уникального `windowId`, он делегировал экшен **активному проекту** (Проекту 2), перемещая и зумя его окно.

2. **Нестабильность React-ключей при смене активного проекта (Key-Shift Bug):**
   В `Canvas.js` активный проект рендерил окна с `key={win.id}`, а неактивные — с `key={`${pid}:${win.id}`}`. При любой смене `activeProjectId` React считал, что старое окно удалено, а новое создано. Это срывало привязанные слушатели мыши (`mousemove`, `mouseup`) и приводило к потере фокуса прямо в процессе жеста.

3. **Отсутствие адресного роутера окон в `multiReducer`:**
   В глобальном сторе `multiReducer` отсутствовал перехват экшенов управления окнами по `windowId`, из-за чего все нераспознанные экшены автоматически направлялись в активный проект (`delegateToActiveProject`).

---

## 3. Выполненные исправления

### 3.1. Стабилизация React-ключей (`app/components/Canvas.js`)
* В секции рендеринга неактивных проектов составной ключ заменён на стабильный уникальный идентификатор:
  ```jsx
  <LevelWindow
      key={win.id}
      windowData={{ ...win, index: win.levelIndex, ... }}
      ...
  />
  ```
* Теперь смена активного проекта не вызывает перемонтирования DOM-узлов окон — React сохраняет смонтированный компонент и его внутренние слушатели.

### 3.2. Адресная передача `windowId` (`app/components/LevelWindow.js`)
* В `LevelWindow.js` добавлены `windowIdRef` и передача `windowId: windowData.id` во все обработчики:
  * Перемещение окна: `MOVE_LEVEL_WINDOW { windowId, index, position, ... }`
  * Ресайз окна: `RESIZE_LEVEL_WINDOW { windowId, index, size, ... }`
  * Зум колесиком и тач-жесты: `UPDATE_LEVEL_PROPERTIES { windowId, index, updates, ... }`
  * Внутреннее панорамирование (мышь/тач): `UPDATE_LEVEL_PROPERTIES { windowId, index, updates, ... }`

### 3.3. Автоматический поиск проекта по `windowId` (`app/store/reducer.js`)
* В `reducer.js` обновлена выборка целевого окна:
  ```javascript
  const targetKey = windowId !== undefined ? windowId : (id !== undefined ? id : index);
  const win = resolveWindow(state, targetKey);
  ```
* В `multiReducer` добавлен перехват оконных действий:
  ```javascript
  case 'MOVE_LEVEL_WINDOW':
  case 'RESIZE_LEVEL_WINDOW':
  case 'UPDATE_LEVEL_PROPERTIES':
  case 'PAN_LEVEL_WINDOW':
  case 'ZOOM_LEVEL_WINDOW':
  case 'TOGGLE_LEVEL_COLLAPSE': {
      const payload = action.payload || {};
      const winId = payload.windowId || (typeof payload.id === 'string' && !/^\d+$/.test(payload.id) ? payload.id : null);
      let targetPid = m.activeProjectId;
      if (winId && m.projects) {
          const found = Object.keys(m.projects).find(pid => {
              const p = m.projects[pid];
              return p && p.levelWindows && p.levelWindows[winId];
          });
          if (found) targetPid = found;
      }
      if (!targetPid || !m.projects[targetPid]) return delegateToActiveProject(m, action);
      const flatIn = projectFlatView(m, targetPid);
      const flatOut = reducer(flatIn, action);
      if (flatOut === flatIn) return m;
      return writeProjectView(m, targetPid, flatOut);
  }
  ```

### 3.4. Безопасная мягкая активация проекта
* Проект активируется только по завершению клика: в событии `onClick` шапки уровня или при клике в пустое место вьюпорта (`handleMouseDownViewport` при `e.button === 0` без зажатого драга).
* Это исключает любые срывы жестов в процессе панорамирования или перемещения рамки.

---

## 4. Результаты проверки и верификация

1. **Юнит-тесты (`node --test`):**
   * В [`app/tests/projects.test.js`](file:///c:/workspaces/Architector/New%20lvl%20system/right_way/Arch0/app/tests/projects.test.js) добавлен автоматический тест на перемещение и зум окон неактивного проекта по `windowId`.
   * Все **198 тестов** успешно пройдены (0 ошибок).
2. **Zero-Build & Cache:**
   * Кэш-бастер скриптов в `index.html` обновлён до `v=10.30`.
3. **Ручная проверка пользовательских сценариев:**
   * Зум колесиком над любым окном масштабирует строго выбранное окно.
   * Перетаскивание шапки двигает только целевое окно; чужие окна остаются на своих местах.
   * Клик по окну мягко активирует проект без моргания экрана и сбоев.
