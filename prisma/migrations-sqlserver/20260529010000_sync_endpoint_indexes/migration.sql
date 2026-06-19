BEGIN TRY

BEGIN TRAN;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'SyncOutboxEvent_syncNode_target_event_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[SyncOutboxEvent]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [SyncOutboxEvent_syncNode_target_event_idx]
        ON [dbo].[SyncOutboxEvent]([syncNodeId], [targetNodeCode], [eventType]);
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'SyncOutboxEvent_syncNode_target_status_created_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[SyncOutboxEvent]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [SyncOutboxEvent_syncNode_target_status_created_idx]
        ON [dbo].[SyncOutboxEvent]([syncNodeId], [targetNodeCode], [status], [createdAt]);
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'SyncOutboxEvent_syncNode_target_status_attempt_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[SyncOutboxEvent]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [SyncOutboxEvent_syncNode_target_status_attempt_idx]
        ON [dbo].[SyncOutboxEvent]([syncNodeId], [targetNodeCode], [status], [lastAttemptAt]);
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'SyncOutboxEvent_syncNode_target_ack_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[SyncOutboxEvent]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [SyncOutboxEvent_syncNode_target_ack_idx]
        ON [dbo].[SyncOutboxEvent]([syncNodeId], [targetNodeCode], [acknowledgedAt]);
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'SyncInboundEvent_syncNode_source_status_received_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[SyncInboundEvent]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [SyncInboundEvent_syncNode_source_status_received_idx]
        ON [dbo].[SyncInboundEvent]([syncNodeId], [sourceNodeCode], [status], [receivedAt]);
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'SyncInboundEvent_syncNode_source_aggregate_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[SyncInboundEvent]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [SyncInboundEvent_syncNode_source_aggregate_idx]
        ON [dbo].[SyncInboundEvent]([syncNodeId], [sourceNodeCode], [aggregateType], [aggregateId]);
END

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
