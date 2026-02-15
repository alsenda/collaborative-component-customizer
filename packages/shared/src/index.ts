import { z } from "zod";

/**
 * Current protocol version shared across apps and packages.
 */
export const PROTOCOL_VERSION = 1;

/**
 * Generic ID shape used by collaboration resources.
 */
export type EntityId = string;
export type RoomId = EntityId;
export type ClientId = EntityId;
export type ComponentId = EntityId;
export type PageId = EntityId;
export type InstanceId = EntityId;
export type NodeId = EntityId;
export type VersionId = EntityId;
export type DraftId = EntityId;

export interface AtomicDoc {
	componentId: ComponentId;
	className: string;
}

export interface PageInstanceOverride {
	instanceId: InstanceId;
	nodeId: NodeId;
	className: string;
}

export interface PageDoc {
	pageId: PageId;
	overrides: PageInstanceOverride[];
}

export type PatchOp =
	| {
			op: "setAtomicClassName";
			componentId: ComponentId;
			className: string;
		}
	| {
			op: "setPageNodeClassName";
			pageId: PageId;
			instanceId: InstanceId;
			nodeId: NodeId;
			className: string;
		}
	| {
			op: "unsetPageNodeClassName";
			pageId: PageId;
			instanceId: InstanceId;
			nodeId: NodeId;
		};

export interface VersionSummary {
	versionId: VersionId;
	createdAtIso: string;
	authorClientId: ClientId;
}

export interface LockTargetAtomic {
	target: "atomic";
	componentId: ComponentId;
}

export interface LockTargetPage {
	target: "page";
	pageId: PageId;
	instanceId: InstanceId;
	nodeId: NodeId;
}

export type LockTarget = LockTargetAtomic | LockTargetPage;

interface ProtocolEnvelope {
	protocolVersion: typeof PROTOCOL_VERSION;
}

export type JoinMessage = ProtocolEnvelope & {
	type: "join";
	roomId: RoomId;
	clientId: ClientId;
};

export type SubscribeMessage = ProtocolEnvelope & {
	type: "subscribe";
	roomId: RoomId;
};

export type PatchDraftMessage = ProtocolEnvelope & {
	type: "patchDraft";
	roomId: RoomId;
	draftId: DraftId;
	baseVersionId: VersionId;
	ops: PatchOp[];
};

export type SaveMessage = ProtocolEnvelope & {
	type: "save";
	roomId: RoomId;
	baseVersionId: VersionId;
	ops: PatchOp[];
};

export type ListVersionsMessage = ProtocolEnvelope & {
	type: "listVersions";
	roomId: RoomId;
};

export type GetVersionMessage = ProtocolEnvelope & {
	type: "getVersion";
	roomId: RoomId;
	versionId: VersionId;
};

export type ReapplyVersionMessage = ProtocolEnvelope & {
	type: "reapplyVersion";
	roomId: RoomId;
	versionId: VersionId;
};

export type LockAcquireMessage = ProtocolEnvelope & {
	type: "lockAcquire";
	roomId: RoomId;
	clientId: ClientId;
	lockTarget: LockTarget;
};

export type LockReleasedMessage = ProtocolEnvelope & {
	type: "lockReleased";
	roomId: RoomId;
	clientId: ClientId;
	lockTarget: LockTarget;
};

export type DocMessage = ProtocolEnvelope & {
	type: "doc";
	roomId: RoomId;
	versionId: VersionId;
	atomicDoc: AtomicDoc;
	pageDoc: PageDoc;
};

export type SavedMessage = ProtocolEnvelope & {
	type: "saved";
	roomId: RoomId;
	versionId: VersionId;
	createdAtIso: string;
};

export type VersionsMessage = ProtocolEnvelope & {
	type: "versions";
	roomId: RoomId;
	versions: VersionSummary[];
};

export type VersionDocMessage = ProtocolEnvelope & {
	type: "versionDoc";
	roomId: RoomId;
	versionId: VersionId;
	atomicDoc: AtomicDoc;
	pageDoc: PageDoc;
};

export type LockGrantedMessage = ProtocolEnvelope & {
	type: "lockGranted";
	roomId: RoomId;
	clientId: ClientId;
	lockTarget: LockTarget;
};

export type LockDeniedMessage = ProtocolEnvelope & {
	type: "lockDenied";
	roomId: RoomId;
	clientId: ClientId;
	lockTarget: LockTarget;
	reason: "alreadyLocked" | "invalidTarget";
};

export type PresenceMessage = ProtocolEnvelope & {
	type: "presence";
	roomId: RoomId;
	clientIds: ClientId[];
};

export type ClientMessage =
	| JoinMessage
	| SubscribeMessage
	| PatchDraftMessage
	| SaveMessage
	| ListVersionsMessage
	| GetVersionMessage
	| ReapplyVersionMessage
	| LockAcquireMessage
	| LockReleasedMessage;

export type ServerMessage =
	| DocMessage
	| SavedMessage
	| VersionsMessage
	| VersionDocMessage
	| LockGrantedMessage
	| LockDeniedMessage
	| LockReleasedMessage
	| PresenceMessage;

const idSchema = z.string().min(1).max(128);
const isoDateTimeSchema = z.string().datetime({ offset: true });

const atomicDocSchema = z.object({
	componentId: idSchema,
	className: z.string().max(2048)
});

const pageInstanceOverrideSchema = z.object({
	instanceId: idSchema,
	nodeId: idSchema,
	className: z.string().max(2048)
});

const pageDocSchema = z.object({
	pageId: idSchema,
	overrides: z.array(pageInstanceOverrideSchema)
});

const lockTargetSchema = z.discriminatedUnion("target", [
	z.object({
		target: z.literal("atomic"),
		componentId: idSchema
	}),
	z.object({
		target: z.literal("page"),
		pageId: idSchema,
		instanceId: idSchema,
		nodeId: idSchema
	})
]);

const patchOpSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("setAtomicClassName"),
		componentId: idSchema,
		className: z.string().max(2048)
	}),
	z.object({
		op: z.literal("setPageNodeClassName"),
		pageId: idSchema,
		instanceId: idSchema,
		nodeId: idSchema,
		className: z.string().max(2048)
	}),
	z.object({
		op: z.literal("unsetPageNodeClassName"),
		pageId: idSchema,
		instanceId: idSchema,
		nodeId: idSchema
	})
]);

const protocolEnvelopeSchema = z.object({
	protocolVersion: z.literal(PROTOCOL_VERSION)
});

export const clientMessageSchema = z.discriminatedUnion("type", [
	protocolEnvelopeSchema.extend({
		type: z.literal("join"),
		roomId: idSchema,
		clientId: idSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("subscribe"),
		roomId: idSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("patchDraft"),
		roomId: idSchema,
		draftId: idSchema,
		baseVersionId: idSchema,
		ops: z.array(patchOpSchema).max(200)
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("save"),
		roomId: idSchema,
		baseVersionId: idSchema,
		ops: z.array(patchOpSchema).max(200)
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("listVersions"),
		roomId: idSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("getVersion"),
		roomId: idSchema,
		versionId: idSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("reapplyVersion"),
		roomId: idSchema,
		versionId: idSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("lockAcquire"),
		roomId: idSchema,
		clientId: idSchema,
		lockTarget: lockTargetSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("lockReleased"),
		roomId: idSchema,
		clientId: idSchema,
		lockTarget: lockTargetSchema
	})
]);

export const serverMessageSchema = z.discriminatedUnion("type", [
	protocolEnvelopeSchema.extend({
		type: z.literal("doc"),
		roomId: idSchema,
		versionId: idSchema,
		atomicDoc: atomicDocSchema,
		pageDoc: pageDocSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("saved"),
		roomId: idSchema,
		versionId: idSchema,
		createdAtIso: isoDateTimeSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("versions"),
		roomId: idSchema,
		versions: z.array(
			z.object({
				versionId: idSchema,
				createdAtIso: isoDateTimeSchema,
				authorClientId: idSchema
			})
		)
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("versionDoc"),
		roomId: idSchema,
		versionId: idSchema,
		atomicDoc: atomicDocSchema,
		pageDoc: pageDocSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("lockGranted"),
		roomId: idSchema,
		clientId: idSchema,
		lockTarget: lockTargetSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("lockDenied"),
		roomId: idSchema,
		clientId: idSchema,
		lockTarget: lockTargetSchema,
		reason: z.enum(["alreadyLocked", "invalidTarget"])
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("lockReleased"),
		roomId: idSchema,
		clientId: idSchema,
		lockTarget: lockTargetSchema
	}),
	protocolEnvelopeSchema.extend({
		type: z.literal("presence"),
		roomId: idSchema,
		clientIds: z.array(idSchema)
	})
]);

export type ParseErrorCode = "INVALID_MESSAGE" | "UNSUPPORTED_PROTOCOL_VERSION";

export interface ParseError {
	code: ParseErrorCode;
	message: string;
	issues?: string[];
	supportedProtocolVersion: typeof PROTOCOL_VERSION;
}

export function isSupportedProtocolVersion(version: unknown): version is typeof PROTOCOL_VERSION {
	return version === PROTOCOL_VERSION;
}

export function parseClientMessage(input: unknown): ClientMessage | ParseError {
	if (typeof input === "object" && input !== null && "protocolVersion" in input) {
		const candidateVersion = (input as { protocolVersion?: unknown }).protocolVersion;
		if (!isSupportedProtocolVersion(candidateVersion)) {
			return {
				code: "UNSUPPORTED_PROTOCOL_VERSION",
				message: "Unsupported protocol version. Upgrade strategy: reject and ask client to reconnect with supported protocol.",
				supportedProtocolVersion: PROTOCOL_VERSION
			};
		}
	}

	const result = clientMessageSchema.safeParse(input);
	if (!result.success) {
		return {
			code: "INVALID_MESSAGE",
			message: "Invalid client message payload.",
			issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
			supportedProtocolVersion: PROTOCOL_VERSION
		};
	}

	return result.data;
}

export function parseServerMessage(input: unknown): ServerMessage | ParseError {
	if (typeof input === "object" && input !== null && "protocolVersion" in input) {
		const candidateVersion = (input as { protocolVersion?: unknown }).protocolVersion;
		if (!isSupportedProtocolVersion(candidateVersion)) {
			return {
				code: "UNSUPPORTED_PROTOCOL_VERSION",
				message: "Unsupported protocol version. Upgrade strategy: reject and ask peer to reconnect with supported protocol.",
				supportedProtocolVersion: PROTOCOL_VERSION
			};
		}
	}

	const result = serverMessageSchema.safeParse(input);
	if (!result.success) {
		return {
			code: "INVALID_MESSAGE",
			message: "Invalid server message payload.",
			issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
			supportedProtocolVersion: PROTOCOL_VERSION
		};
	}

	return result.data;
}
