/**
 * INVENTORY'S CLIENT-SAFE CORE. Import from here.
 *
 * The model, the quantity arithmetic, the filter predicate and every word the screens say —
 * everything the browser needs and everything the count transaction needs, in one place so that
 * neither can drift from the other. The database side lives in `$lib/server/modules/inventory`,
 * and nothing in here knows it exists.
 */
export {
	COMMON_UNITS,
	MOVEMENT_REASONS,
	STOCK_COUNT_STATUSES,
	isMovementReason,
	isStockCountStatus
} from './types';

export type {
	CountedLine,
	InventoryItem,
	InventoryLevel,
	InventoryListItem,
	InventoryLocation,
	InventoryMovement,
	MovementReason,
	PickableItem,
	StockCount,
	StockCountLine,
	StockCountStatus
} from './types';

export {
	countProgress,
	difference,
	isBelowReorderPoint,
	netValueEffect,
	onHand,
	onHandAt,
	settleLine,
	valueEffect,
	varyingLines
} from './stock';

export {
	INVENTORY_FILTERS,
	INVENTORY_SORTS,
	defaultDirection,
	filterLabel,
	isInventoryFilter,
	isInventorySort,
	isSortDirection,
	matchesFilter
} from './filter';

export type { InventoryFilter, InventorySort, SortDirection } from './filter';

export {
	countAppliedCopy,
	countProgressLine,
	countReassurance,
	countReviewCopy,
	countStartedLine,
	countTitle,
	emptyCopy,
	homeStandingCopy,
	matchedRowLabel,
	movementReasonCopy,
	reviewChangesLabel,
	standingSentence,
	stockCopy,
	summarySentence,
	uncostedNote
} from './copy';

export type {
	CountReassurance,
	CountReviewCopy,
	StandingCopy,
	StockCopy,
	SummaryFacts,
	Tone
} from './copy';

export {
	COUNTED_FIELD,
	COUNT_STEPS,
	checkCounted,
	countPeriodFor,
	liveLine,
	stepOfStatus,
	triageCount
} from './counting';

export type { CountLineState, CountSheetRow, CountStep, CountTriage, TriagedRow } from './counting';

export type { CountLinePatch, CountPatch, CountSaveResult, ItemPatch, MovementPatch } from './wire';
