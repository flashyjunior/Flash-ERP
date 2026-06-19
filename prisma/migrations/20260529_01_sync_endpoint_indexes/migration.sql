CREATE INDEX IF NOT EXISTS "SyncOutboxEvent_syncNode_target_event_idx"
  ON "SyncOutboxEvent"("syncNodeId", "targetNodeCode", "eventType");

CREATE INDEX IF NOT EXISTS "SyncOutboxEvent_syncNode_target_status_created_idx"
  ON "SyncOutboxEvent"("syncNodeId", "targetNodeCode", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "SyncOutboxEvent_syncNode_target_status_attempt_idx"
  ON "SyncOutboxEvent"("syncNodeId", "targetNodeCode", "status", "lastAttemptAt");

CREATE INDEX IF NOT EXISTS "SyncOutboxEvent_syncNode_target_ack_idx"
  ON "SyncOutboxEvent"("syncNodeId", "targetNodeCode", "acknowledgedAt");

CREATE INDEX IF NOT EXISTS "SyncInboundEvent_syncNode_source_status_received_idx"
  ON "SyncInboundEvent"("syncNodeId", "sourceNodeCode", "status", "receivedAt");

CREATE INDEX IF NOT EXISTS "SyncInboundEvent_syncNode_source_aggregate_idx"
  ON "SyncInboundEvent"("syncNodeId", "sourceNodeCode", "aggregateType", "aggregateId");
