import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

export type ConnectionType =
  | "unknown"
  | "none"
  | "wifi"
  | "cellular"
  | "bluetooth"
  | "ethernet"
  | "wimax"
  | "vpn"
  | "other";

export type CellularGeneration = "2g" | "3g" | "4g" | "5g" | null;

type NetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  /** Result of real probe validation — general internet works. */
  actualInternetReachable: boolean | null;
  /** App backend /health responded on at least one candidate URL. */
  backendReachable: boolean | null;
  isSlowConnection: boolean;
  transportIsSlow: boolean;
  requestIsSlow: boolean;
  connectionType: ConnectionType;
  cellularGeneration: CellularGeneration;
  isConnectionExpensive: boolean;
  lastStatusChangeAt: string | null;
  lastSlowRequestAt: string | null;
  lastSlowRequestDurationMs: number | null;
  /** Number of actions waiting to be synced once connectivity returns. */
  pendingQueueCount: number;
};

type NetworkSnapshot = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  transportIsSlow: boolean;
  connectionType: ConnectionType;
  cellularGeneration: CellularGeneration;
  isConnectionExpensive: boolean;
};

const initialState: NetworkState = {
  isConnected: true,
  isInternetReachable: null,
  actualInternetReachable: null,
  backendReachable: null,
  isSlowConnection: false,
  transportIsSlow: false,
  requestIsSlow: false,
  connectionType: "unknown",
  cellularGeneration: null,
  isConnectionExpensive: false,
  lastStatusChangeAt: null,
  lastSlowRequestAt: null,
  lastSlowRequestDurationMs: null,
  pendingQueueCount: 0,
};

const networkSlice = createSlice({
  name: "network",
  initialState,
  reducers: {
    updateNetworkSnapshot(state, action: PayloadAction<NetworkSnapshot>) {
      const next = action.payload;
      const didConnectionStateChange =
        state.isConnected !== next.isConnected ||
        state.isInternetReachable !== next.isInternetReachable ||
        state.connectionType !== next.connectionType ||
        state.cellularGeneration !== next.cellularGeneration ||
        state.isConnectionExpensive !== next.isConnectionExpensive ||
        state.transportIsSlow !== next.transportIsSlow;

      state.isConnected = next.isConnected;
      state.isInternetReachable = next.isInternetReachable;
      state.transportIsSlow = next.transportIsSlow;
      state.isSlowConnection = next.transportIsSlow;
      state.connectionType = next.connectionType;
      state.cellularGeneration = next.cellularGeneration;
      state.isConnectionExpensive = next.isConnectionExpensive;

      if (didConnectionStateChange) {
        state.lastStatusChangeAt = new Date().toISOString();
      }
    },
    reportSlowRequest(state, action: PayloadAction<number>) {
      state.requestIsSlow = true;
      state.lastSlowRequestAt = new Date().toISOString();
      state.lastSlowRequestDurationMs = action.payload;
      state.lastStatusChangeAt = new Date().toISOString();
    },
    clearSlowRequestSignal(state) {
      state.requestIsSlow = false;
      state.isSlowConnection = state.transportIsSlow;
      state.lastSlowRequestAt = null;
      state.lastSlowRequestDurationMs = null;
      state.lastStatusChangeAt = new Date().toISOString();
    },
    setActualInternetReachable(state, action: PayloadAction<boolean>) {
      state.actualInternetReachable = action.payload;
    },
    setConnectivitySnapshot(
      state,
      action: PayloadAction<{ hasInternet: boolean; backendReachable: boolean }>,
    ) {
      state.actualInternetReachable = action.payload.hasInternet;
      state.backendReachable = action.payload.backendReachable;
    },
    setPendingQueueCount(state, action: PayloadAction<number>) {
      state.pendingQueueCount = action.payload;
    },
  },
});

export const {
  clearSlowRequestSignal,
  reportSlowRequest,
  updateNetworkSnapshot,
  setActualInternetReachable,
  setConnectivitySnapshot,
  setPendingQueueCount,
} = networkSlice.actions;

export default networkSlice.reducer;