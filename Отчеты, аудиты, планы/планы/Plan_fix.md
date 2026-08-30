# План исправления бага Drag&Drop оверлея (Plan_fix)

## 1. Описание проблемы и коренная причина (Root Cause)

### Проблема
1. На Уровне 0 (Главный холст) создан узел `A`.
2. На Уровне 1 создан дочерний узел `A1` (`ownerId: "A"`).
3. Камера окна Уровня 1 сдвинута так, что узел `A1` находится за рамкой окна (скрыт благодаря `overflow: hidden` вьюпорта).
4. При включённом режиме Drag&Drop (`ui.dragDropMode: true`) пользователь начинает перемещать узел `A` на Уровне 0.
5. Узел `A1` внезапно материализуется на общем холсте поверх других окон за пределами своего уровня.

### Коренная причина
Для предотвращения обрезания переносимых элементов при выходе за границы окна в `Canvas.js` (строки ~748–835) рендерится специальный глобальный слой `drag-overlay-*`.

Чтобы при перетаскивании слоя (Layer) вместе с ним визуально летели все вложенные в него узлы, алгоритм собирает `expandedDragIds`. Однако для сбора потомков ошибочно вызывается `HierarchyUtils.hasAncestorIn`, которая обходит не только координатные контейнеры (`parentId`), но и **межуровневые родственные связи (`ownerId`)**.

Из-за этого:
- При перетаскивании родителя `A` на L0 функция считает дочерний узел `A1` на L1 «потомком» и включает его в `expandedDragIds`.
- Для окна L1 создаётся `drag-overlay-lvlwin-1` с `zIndex: 60` и трансформацией камеры L1, но **без клиппинга (`overflow: hidden`)**.
- Узел `A1` рисуется в оверлее на холсте, несмотря на то, что в обычном рендере окна он скрыт за рамкой.

---

## 2. Предлагаемое решение (Системное разделение)

Разделить в архитектуре проверку **координатной вложенности (контейнеры `parentId`)** и **иерархического родства (`ownerId`)**.

1. Добавить в `HierarchyUtils` метод `hasContainerAncestorIn`, который строго проверяет цепочку `parentId` (контейнеры слоев на том же уровне) и игнорирует `ownerId`.
2. Заменить вызов `hasAncestorIn` на `hasContainerAncestorIn` в `Canvas.js` при формировании `expandedDragIds`.
3. Унифицировать локальные проверки `hasSelectedAncestor` в `reducer.js` и `Layer.js`, заменив их на вызов `HierarchyUtils.hasContainerAncestorIn`.
4. Добавить юнит-тесты на `hasContainerAncestorIn` и на отсутствие утечки `ownerId`-потомков в драг-оверлей.

---

## 3. Файлы и изменения

### 3.1. Ядро иерархии (`app/utils/hierarchy.js`)
Добавить метод `hasContainerAncestorIn(id, containerIds, nodes, layers)`:
- Принимает `id` сущности, список `containerIds` (или одиночный id), словари `nodes` и `layers`.
- Обходит только цепочку `current.parentId` (пока `parentId && parentId !== 'root'`).
- Возвращает `true`, если любой предок по `parentId` содержится в `containerIds`.
- Защищён от циклических ссылок через `Set(visited)`.

```javascript
hasContainerAncestorIn: (id, containerIds, nodes, layers = null) => {
    const set = HierarchyUtils.toFocusList(containerIds);
    if (set.length === 0) return false;
    const safeNodes = nodes || {};
    const safeLayers = layers || {};
    let current = safeNodes[id] || safeLayers[id];
    const visited = new Set();
    while (current && current.parentId && current.parentId !== 'root' && !visited.has(current.parentId)) {
        if (set.includes(current.parentId)) return true;
        visited.add(current.parentId);
        current = safeNodes[current.parentId] || safeLayers[current.parentId] || null;
    }
    return false;
}
```

---

### 3.2. Рендеринг холста и оверлея (`app/components/Canvas.js`)
В блоке формирования `expandedDragIds` (строки ~768–780) заменить вызовы `H.hasAncestorIn` на `H.hasContainerAncestorIn`:

```javascript
const expandedDragIds = (() => {
    const seeds = state.dragGesture.ids;
    const keep = new Set(seeds);
    if (H.hasContainerAncestorIn) {
        Object.keys(dragProjectView.nodes || {}).forEach(nid => {
            if (!keep.has(nid) && H.hasContainerAncestorIn(nid, seeds, dragProjectView.nodes, dragProjectView.layers)) keep.add(nid);
        });
        Object.keys(dragProjectView.layers || {}).forEach(lid => {
            if (!keep.has(lid) && H.hasContainerAncestorIn(lid, seeds, dragProjectView.nodes, dragProjectView.layers)) keep.add(lid);
        });
    }
    return Array.from(keep);
})();
```

---

### 3.3. Редьюсер и компоненты (`app/store/reducer.js`, `app/components/Layer.js`)
- В `app/store/reducer.js` в обработчике `case 'MOVE_SELECTED':` заменить локальную функцию `hasSelectedAncestor` на вызов `HierarchyUtils.hasContainerAncestorIn(id, selectedSet, state.nodes, state.layers)`.
- В `app/components/Layer.js` заменить локальную функцию `hasSelectedAncestor` на вызов `HierarchyUtils.hasContainerAncestorIn`.

---

### 3.4. Тесты (`app/tests/hierarchy.test.js`)
Добавить тесты на `HierarchyUtils.hasContainerAncestorIn`:
- Узел внутри слоя: возвращает `true`.
- Узел внутри вложенного подслоя: возвращает `true`.
- Межуровневый потомок (`ownerId: 'A'`, но `parentId: 'root'`): возвращает `false` (гарантия защиты от бага).
- Защита от циклов.

---

## 4. План верификации

### Автоматические тесты
1. Запуск юнит-тестов:
   `node --test app/tests/hierarchy.test.js app/tests/reducer.test.js`
2. Проверка синтаксиса и сборки:
   `node app/bench/syntax-check.js`
3. Запуск полного набора тестов:
   `node --test app/tests/*.test.js`

### Ручное тестирование сценария
1. Открыть приложение в браузере.
2. Создать узел `A` на Главном холсте (L0).
3. Создать дочерний узел `A1` на L1.
4. Сдвинуть камеру в окне L1 так, чтобы узел `A1` скрылся за рамкой.
5. Включить тумблер **Drag&Drop**.
6. Перетаскивать узел `A` по L0: убедиться, что узел `A1` **НЕ появляется** на общем холсте.
7. Создать слой `L` на L0, поместить в него узел `B`. Начать перетаскивать слой `L` за границы окна: убедиться, что узел `B` летит вместе со слоем в оверлее без обрезания.
