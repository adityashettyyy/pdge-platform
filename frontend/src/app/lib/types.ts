export type NodeType = "HOSPITAL"|"DEPOT"|"SHELTER"|"ZONE"|"CHECKPOINT";
export type EdgeStatus = "OPEN"|"SLOW"|"BLOCKED";
export type ResourceType = "AMBULANCE"|"FIRE_TRUCK"|"RESCUE_TEAM"|"DRONE"|"SUPPLY_TRUCK"|"HELICOPTER";
export type ResourceStatus = "IDLE"|"TRANSIT"|"DEPLOYED"|"MAINTENANCE"|"PRE_POSITIONED";
export type DisasterType = "FLOOD"|"FIRE"|"EARTHQUAKE"|"CYCLONE"|"LANDSLIDE"|"CHEMICAL"|"UNKNOWN";
export type IncidentStatus = "UNVERIFIED"|"VERIFIED"|"ACTIVE"|"MONITORING"|"CLOSED";
export type TrustVerdict = "UNVERIFIED"|"ACCUMULATING"|"VERIFIED"|"REJECTED";
export type PlanStatus = "GENERATED"|"PENDING_APPROVAL"|"APPROVED"|"OVERRIDDEN"|"EXPIRED";
export type UserRole = "ADMIN"|"AGENCY_LEAD"|"OPERATOR"|"VIEWER";
export type AssignmentPriority = "CRITICAL"|"HIGH"|"NORMAL";

export interface GraphNode { id:string; label:string; type:NodeType; latitude:number; longitude:number; capacity:number; currentLoad:number; population:number; disasterRisk:number; isActive:boolean; updatedAt:string; }
export interface GraphEdge { id:string; fromNodeId:string; toNodeId:string; weight:number; status:EdgeStatus; slowFactor:number; }
export interface GraphSnapshot { nodes:GraphNode[]; edges:GraphEdge[]; riskMap:Record<string,number>; }
export interface Resource { id:string; label:string; type:ResourceType; status:ResourceStatus; currentNodeId:string|null; currentNode?:GraphNode; capacity:number; fuelLevel:number; fatigueLevel:number; isActive:boolean; updatedAt:string; }
export interface Incident { id:string; type:DisasterType; status:IncidentStatus; trustScore:number; latitude:number|null; longitude:number|null; originNodeId:string|null; originNode?:GraphNode; reportCount:number; description?:string; createdAt:string; closedAt:string|null; }
export interface ResourceAssignment { id:string; resourceId:string; resource?:Resource; fromNodeId:string; toNodeId:string; etaMinutes:number; priority:AssignmentPriority; confidence:number; }
export interface AllocationPlan { id:string; status:PlanStatus; strategyUsed:string; confidence:number; totalResources:number; humanApproved:boolean; assignments:ResourceAssignment[]; createdAt:string; }
export interface DashboardKPIs { activeIncidents:number; verifiedIncidents:number; resourcesDeployed:number; resourcesAvailable:number; avgResponseTimeMin:number; simulationsRun:number; plansAwaitingApproval:number; }
export interface AuthUser { id:string; email:string; name:string; role:UserRole; organizationId:string|null; } // ← added organizationId
export interface LoginResponse { token:string; user:AuthUser; }
export interface ReportResponse { incidentId:string; jobId:string; trustScore:number; message:string; }
export type WsEventType = "INITIAL_STATE"|"STATE_UPDATE"|"EDGE_BLOCKED"|"RISK_SPIKE"|"SIMULATION_COMPLETE"|"ALLOCATION_APPROVED";
export interface WsEvent<T=unknown> { type:WsEventType; payload:T; timestamp:string; }
