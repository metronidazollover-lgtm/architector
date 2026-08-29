// Центральные JSDoc-типы проекта. Файл не содержит кода и не подключается в index.html:
// его читает только tsc (checkJs) через jsconfig.json.

/**
 * Точка в координатах, относительных к родителю сущности.
 * Для parentId === 'root' совпадает с мировыми координатами холста.
 * @typedef {{ x: number, y: number }} Point
 */

/**
 * @typedef {{ w: number, h: number }} Size
 */

/**
 * @typedef {{ offset: Point, zoom: number }} Camera
 */

/**
 * @typedef {'rectangle'} NodeShape
 */

/**
 * @typedef {Object} NodeEntity
 * @property {string} id: всегда совпадает с ключом в словаре nodes
 * @property {string} name
 * @property {string} [group]
 * @property {string} [content]
 * @property {string} [color]
 * @property {Point} position
 * @property {Size} size
 * @property {string} parentId: 'root', id слоя или id узла
 * @property {?string} [ownerId] владелец на уровне выше (родство между уровнями)
 * @property {number} [homeLevel] якорь сироты: домашний уровень сущности без владельца
 * @property {number} [ownerGap] дистанция до владельца в уровнях (нет поля — 1; >1 — связь через поколение)
 * @property {boolean} [snapToGrid]
 * @property {NodeShape} [shape]
 * @property {'default'|'ai-agent'} [type]
 * @property {string} [mediaUrl]
 * @property {number} [mediaHeight]
 * @property {boolean} [userResized]
 * @property {boolean} [hidden]
 * @property {string} [icon]
 * @property {string} [fontFamily]
 * @property {number} [fontSize]
 */

/**
 * @typedef {Object} LayerEntity
 * @property {string} id
 * @property {string} name
 * @property {string} [content]
 * @property {string} [color]
 * @property {Point} position
 * @property {Size} size
 * @property {boolean} [locked]
 * @property {boolean} [isLevelWindow] ЛЕГАСИ: слой-окно уровня (старый формат)
 * @property {string} parentId
 * @property {?string} [ownerId] владелец на уровне выше (родство между уровнями)
 * @property {number} [homeLevel] якорь сироты: домашний уровень сущности без владельца
 * @property {number} [ownerGap] дистанция до владельца в уровнях (нет поля — 1; >1 — связь через поколение)
 * @property {boolean} [snapToGrid]
 * @property {string} [fontFamily]
 * @property {number} [fontSize]
 */

/**
 * @typedef {Object} PortEntity
 * @property {string} id
 * @property {string} nodeId: id родительского узла или слоя
 * @property {'input'|'output'} type
 * @property {'left'|'right'|'top'|'bottom'} edge
 * @property {number} position: смещение вдоль грани, от 0.0 до 1.0
 * @property {string} [name]
 * @property {string} [content]
 * @property {string} [color]
 * @property {string} [fontFamily]
 * @property {number} [fontSize]
 */

/**
 * @typedef {Object} LinkEntity
 * @property {string} id
 * @property {string} sourcePortId
 * @property {string} targetPortId
 * @property {string} [name]
 * @property {string} [content]
 * @property {string} [color]
 * @property {'bezier'|'orthogonal'} [linkStyle]
 * @property {string} [context]
 * @property {string} [fontFamily]
 * @property {number} [fontSize]
 */

/**
 * @typedef {Object} LevelWindowEntity
 * @property {string} [id] стабильный id окна (ключ словаря levelWindows; L0 — 'lvlwin-root')
 * @property {number} [levelIndex] номер уровня, который обслуживает окно
 * @property {number} [index] ЛЕГАСИ: номер уровня до перехода на стабильные id
 * @property {string} name
 * @property {string} [content]
 * @property {string} [color]
 * @property {Point} position
 * @property {Size} size
 * @property {Point} innerOffset
 * @property {number} innerZoom
 * @property {boolean} [isCollapsed]
 * @property {string} [fontFamily]
 * @property {number} [fontSize]
 */

/**
 * @typedef {Object} AppState
 * @property {Object<string, LayerEntity>} layers
 * @property {Object<string, NodeEntity>} nodes
 * @property {Object<string, PortEntity>} ports
 * @property {Object<string, LinkEntity>} links
 * @property {Object<number, LevelWindowEntity>} [levelWindows]
 * @property {string} [projectName]
 * @property {string} [projectColor]
 * @property {string} [projectFontFamily]
 * @property {string} [projectContent]
 * @property {number} [activeLevelIndex]
 * @property {Object<number, string>} [levelFocusParentId]
 * @property {Object<number, boolean>} [levelHideNeighbors]
 * @property {string[]} selectedIds
 * @property {string[]} isolatedIds
 * @property {string} interactionMode
 * @property {?Object} pendingConnection
 * @property {Camera} canvas
 * @property {Object} ui
 * @property {Array} aiChatHistory
 * @property {?NodeEntity} clipboard
 * @property {Array} past: снапшоты undo
 * @property {Array} future: снапшоты redo
 * @property {string[]} historyLogs
 */

/**
 * @typedef {{ type: string, payload?: * }} Action
 */

