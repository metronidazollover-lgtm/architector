# План реорганизации создания элементов: разграничение FAB Toolbar и ContextActionBar

Данный документ описывает перевод функционала межуровневой вложенности (создания потомков на подуровнях) из плавающей кнопки FAB в верхние панели свойств узлов и слоев, а также фиксацию локального контекста создания для кнопки FAB.

---

## 1. Текущее поведение (As-Is)

* **Основная кнопка FAB (`app/components/Toolbar.js`):**
  * При выделенном узле клик по кнопке «+» вызывал `CREATE_NESTED_NODE`, создавая **дочерний узел на следующем уровне (L{N+1})**, а на кнопке отображался бейдж целевого подуровня `L{N+1}`.
  * В веере спутников при выделенном узле кнопка «слой» пыталась создать дочерний слой на подуровне.
* **Верхние панели свойств (`app/components/ContextActionBar.js`):**
  * В панелях свойств узла и слоя отсутствовали кнопки для быстрого создания дочерних элементов на подуровне.

---

## 2. Новое целевое поведение (To-Be)

1. **Основная плавающая кнопка FAB справа (`Toolbar.js`)** становится строго **локальным инструментом создания на текущем уровне**:
   * При выделенном узле: создает **узла-брата** (на том же уровне/слое рядом с текущим узлом).
   * При выделенном слое: создает **новый узел внутри выделенного слоя**.
   * При отсутствии выделения (или выделенном окне уровня): создает **узел на активном уровне**.
   * В правом нижнем углу кнопки FAB выводится микро-бейдж с системной иконкой контекста создания:
     * Выделен узел ➔ иконка узла (`icon-box` 📦).
     * Выделен слой ➔ иконка слоя (`icon-layers` 🗂️).
     * Выделено окно уровня / нет выделения ➔ иконка уровня (`icon-folder` 📁) с номером уровня (`L0`, `L1`...).

2. **Веер спутников кнопки FAB (`Toolbar.js`):**
   * **При выделенном узле:**
     * Спутник **«Слой» (`icon-layers`)**: создает новый слой на координатах выделенного узла и **сразу помещает выделенный узел внутрь этого слоя** (узел становится дочерним элементом `parentId: newLayerId`).
     * Спутник **«Порт» (`icon-circle`)**: доступен (включение режима добавления порта).
     * Спутники **«Уровень»**, **«Проект»**, **«Ассистент»**: **приглушены (`disabled / DIM_CONTEXT`)**.
   * **При выделенном слое:**
     * Спутник **«Слой» (`icon-layers`)**: создает подслой внутри выделенного слоя.
     * Спутник **«Ассистент» (`icon-bot`)**: создает ассистента внутри выделенного слоя (`addAssistantInLayer`).
     * Спутник **«Порт» (`icon-circle`)**: доступен.
     * Спутники **«Уровень»**, **«Проект»**: **приглушены (`disabled / DIM_CONTEXT`)**.
   * **Без выделения / при выделении окна уровня:**
     * Все спутники активны и работают в обычном режиме.

3. **Верхняя панель свойств узла (`ContextActionBar.js` -> `selectedNode`):**
   * В ряд кнопок действий добавляется кнопка **«+»** (создать дочерний узел на подуровне).
   * При клике диспатчит `CREATE_NESTED_NODE` с `parentId: selectedNode.id`.

4. **Верхняя панель свойств слоя (`ContextActionBar.js` -> `selectedLayer`):**
   * В ряд кнопок действий добавляется кнопка **«+»** (создать дочерний слой на подуровне).
   * При клике определяет следующий уровень `layerLevel + 1`, при необходимости создает окно уровня (`ADD_LEVEL_WINDOW`) и создает слой `ADD_LAYER` с `parentId: selectedLayer.id` (что через `normalizeContainer` редьюсера делает его `ownerId: selectedLayer.id, parentId: 'root'`).

---

## 3. Детальный план изменений по файлам

### Файл 1: [app/components/Toolbar.js](file:///c:/workspaces/Architector/New%20lvl%20system/Arch0/app/components/Toolbar.js)

1. **Логика клика по FAB (`handleFabClick` / `fabDefaultAction`):**
   * Заменить логику `fabDefaultAction`: теперь для всех контекстов (node, layer, none) вызывается `addNode()`.
   * При выделенном узле `addCtx = HierarchyUtils.getAddContext(state)` уже возвращает `parentId` и `levelIndex` текущего узла/контейнера, что приводит к созданию узла-брата на том же уровне.
   * При выделенном слое `addCtx` возвращает `parentId: selectedLayer.id`, создавая узел внутри слоя.

2. **Создание слоя при выделенном узле (`wrapNodeInNewLayer`):**
   * При нажатии на спутник «Слой» в контексте `fabContext === 'node'`:
     ```javascript
     const wrapNodeInNewLayer = () => {
         if (!selectedNode) return;
         const newLayerId = 'layer-' + Date.now();
         const H = window.HierarchyUtils;
         const nodeLvl = H ? H.getEntityLevel(selectedNode.id, state.nodes, state.layers) : 0;
         
         // Размеры и позиция слоя вокруг узла
         const paddingX = 40;
         const paddingY = 60;
         const layerPos = {
             x: Math.max(0, (selectedNode.position?.x || 0) - paddingX),
             y: Math.max(0, (selectedNode.position?.y || 0) - paddingY)
         };
         const layerSize = {
             w: Math.max(600, (selectedNode.size?.w || 200) + paddingX * 2),
             h: Math.max(400, (selectedNode.size?.h || 100) + paddingY * 2)
         };

         // 1. Создаем слой в том же контейнере, где лежал узел
         dispatch({
             type: 'ADD_LAYER',
             payload: {
                 id: newLayerId,
                 name: `Слой (${selectedNode.name || 'Узел'})`,
                 position: layerPos,
                 size: layerSize,
                 color: '#ff9500',
                 parentId: selectedNode.parentId || 'root',
                 ...(selectedNode.homeLevel != null ? { homeLevel: selectedNode.homeLevel } : {}),
                 ...(selectedNode.ownerGap ? { ownerGap: selectedNode.ownerGap } : {})
             }
         });

         // 2. Перемещаем узел внутрь созданного слоя с локальным смещением
         dispatch({
             type: 'UPDATE_NODE',
             payload: {
                 id: selectedNode.id,
                 updates: {
                     parentId: newLayerId,
                     position: { x: paddingX, y: paddingY }
                 }
             }
         });
     };
     ```

3. **Спутники и правила доступности (`satellites`):**
   * При `fabContext === 'node'`:
     * `port`: активен.
     * `layer`: активен (`onClick: wrapNodeInNewLayer`, `title: 'Создать слой вокруг узла'`).
     * `level`, `project`, `assistant`: `disabled: true`, `colorClass: DIM_CONTEXT`.
   * При `fabContext === 'layer'`:
     * `port`: активен.
     * `layer`: активен (`onClick: addLayer`, создает подслой).
     * `assistant`: активен (`onClick: addAssistantInLayer`).
     * `level`, `project`: `disabled: true`, `colorClass: DIM_CONTEXT`.

4. **Бейджи на кнопке FAB:**
   * Заменить разметку бейджа в правом нижнем углу кнопки FAB:
     * Если `fabContext === 'node'`:
       ```jsx
       <span className="absolute -bottom-1 -right-1 bg-slate-900 text-sky-400 rounded-full w-4 h-4 flex items-center justify-center border border-white/30" title="Создать узел-брат">
           <div className="icon-box text-[10px]"></div>
       </span>
       ```
     * Если `fabContext === 'layer'`:
       ```jsx
       <span className="absolute -bottom-1 -right-1 bg-slate-900 text-orange-400 rounded-full w-4 h-4 flex items-center justify-center border border-white/30" title="Создать узел в слое">
           <div className="icon-layers text-[10px]"></div>
       </span>
       ```
     * Если `fabContext === 'none'`:
       ```jsx
       <span className="absolute -bottom-1 -right-1 bg-slate-900 text-emerald-400 rounded-full w-4 h-4 flex items-center justify-center border border-white/30" title={`Создать узел на Уровне ${addCtx.levelIndex || 0}`}>
           <div className="icon-folder text-[10px]"></div>
       </span>
       ```

---

### Файл 2: [app/components/ContextActionBar.js](file:///c:/workspaces/Architector/New%20lvl%20system/Arch0/app/components/ContextActionBar.js)

1. **Панель свойств узла (`if (selectedNode)`):**
   * Вычислить целевой подуровень:
     ```javascript
     const H = window.HierarchyUtils;
     const nodeChildLevel = H ? H.getEntityLevel(selectedNode.id, nodes, layers) + 1 : 1;
     ```
   * В средний ярус кнопок действий (перед кнопкой удаления или в удобном месте ряда действий) добавить кнопку создания дочернего узла:
     ```jsx
     {/* Создать дочерний узел на подуровне */}
     <button
         className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-sky-400 hover:text-sky-300 hover:bg-sky-500/20 border-sky-500/30 transition-colors"
         title={`Добавить дочерний узел на Уровень ${nodeChildLevel} (потомок «${selectedNode.name || selectedNode.id}»)`}
         onClick={() => {
             dispatch({
                 type: 'CREATE_NESTED_NODE',
                 payload: { parentId: selectedNode.id }
             });
         }}
     >
         <div className="icon-square-plus text-lg"></div>
     </button>
     ```

2. **Панель свойств слоя (`if (selectedLayer)`):**
   * Вычислить целевой подуровень для слоя:
     ```javascript
     const H = window.HierarchyUtils;
     const layerChildLevel = H ? H.getEntityLevel(selectedLayer.id, nodes, layers) + 1 : 1;
     ```
   * В средний ярус кнопок действий добавить кнопку создания дочернего слоя:
     ```jsx
     {/* Создать дочерний слой на подуровне */}
     <button
         className="btn w-10 h-10 p-0 rounded-lg flex items-center justify-center text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 border-orange-500/30 transition-colors"
         title={`Добавить дочерний слой на Уровень ${layerChildLevel} (потомок «${selectedLayer.name || selectedLayer.id}»)`}
         onClick={() => {
             const win = H && H.getWindowOfLevel(layerChildLevel, state.levelWindows);
             if (!win) {
                 dispatch({ type: 'ADD_LEVEL_WINDOW' });
             }
             const levelLayers = {};
             Object.entries(layers || {}).forEach(([lid, l]) => {
                 if (H && H.getEntityLevel(lid, nodes, layers) === layerChildLevel) levelLayers[lid] = l;
             });
             const pos = H ? H.getSmartLevelPlacement(selectedLayer.id, levelLayers) : { x: 80, y: 100 };
             dispatch({
                 type: 'ADD_LAYER',
                 payload: {
                     name: `Слой (потомок «${selectedLayer.name || selectedLayer.id}»)`,
                     position: pos,
                     size: { w: 600, h: 400 },
                     color: selectedLayer.color || '#ff9500',
                     parentId: 'root',
                     ownerId: selectedLayer.id
                 }
             });
         }}
     >
         <div className="icon-folder-plus text-lg"></div>
     </button>
     ```

---

## 4. План верификации

### Автоматические тесты:
* Запустить `node --test` и убедиться, что все 223 теста успешно выполняются без единой ошибки.

### Ручная проверка сценариев:
1. **Тест кнопки FAB при выделенном узле:**
   * Клик по FAB создает узел-брат на том же уровне/слое.
   * На кнопке отображается иконка `icon-box`.
   * В веере: спутник «Слой» оборачивает узел в новый слой; кнопки уровня, проекта, ассистента приглушены.
2. **Тест кнопки FAB при выделенном слое:**
   * Клик по FAB создает узел внутри слоя.
   * На кнопке отображается иконка `icon-layers`.
   * В веере: кнопки уровня и проекта приглушены; ассистент и слой создаются внутри слоя.
3. **Тест кнопок «+» в панелях свойств:**
   * Выделить узел → клик по «+» в панели свойств узла → создается дочерний узел на подуровне L{N+1}.
   * Выделить слой → клик по «+» в панели свойств слоя → создается дочерний слой на подуровне L{N+1}.
