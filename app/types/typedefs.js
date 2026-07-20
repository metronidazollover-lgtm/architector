// Центральные JSDoc-типы проекта. Файл не содержит кода и не подключается в index.html:
// его читает только tsc (checkJs) через jsconfig.json. См. docs/PLAN.md, этап 0.1.

/**
 * Точка в координатах, относительных к родителю сущности.
 * Для parentId === 'root' совпадает с мировыми координатами холста.
 * До миграции v10 (этап 2) все позиции мировые.
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
 * @property {boolean} [snapToGrid]
 * @property {NodeShape} [shape]
 * @property {'default'|'ai-agent'} [type]
 * @property {string} [mediaUrl]
 * @property {boolean} [hidden]
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
 * @property {string} parentId
 * @property {boolean} [snapToGrid]
 */

/**
 * @typedef {Object} PortEntity
 * @property {string} id
 * @property {string} nodeId
 * @property {'input'|'output'} type
 * @property {'left'|'right'|'top'|'bottom'} edge
 * @property {number} position: смещение вдоль грани, от 0.0 до 1.0
 * @property {string} [name]
 * @property {string} [color]
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
 * @property {string} [context]: справочное поле, фактический контекст вычисляется
 */

/**
 * @typedef {{ id: string, name: string }} Breadcrumb
 */

/**
 * @typedef {Object} NavEntry
 * @property {string} id: контекст (узел, порт, связь или 'root')
 * @property {Breadcrumb[]} breadcrumbs: путь на момент посещения
 */

/**
 * @typedef {Object} AppState
 * @property {string} currentContext
 * @property {Breadcrumb[]} breadcrumbs
 * @property {Object<string, LayerEntity>} layers
 * @property {Object<string, NodeEntity>} nodes
 * @property {Object<string, PortEntity>} ports
 * @property {LinkEntity[]} links
 * @property {string[]} selectedIds
 * @property {string[]} isolatedIds
 * @property {string} interactionMode
 * @property {?Object} pendingConnection
 * @property {Camera} canvas
 * @property {Object<string, Camera>} cameraByContext
 * @property {{ past: NavEntry[], future: NavEntry[] }} navHistory
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
