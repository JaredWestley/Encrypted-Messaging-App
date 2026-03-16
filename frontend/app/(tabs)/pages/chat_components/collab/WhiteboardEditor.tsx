import React, { useState, useRef, useEffect, useCallback } from "react";
import { Platform, ScrollView, View, PanResponder, Dimensions } from "react-native";
import { YStack, XStack, Text, Button } from "tamagui";
import {
  Save,
  Pencil,
  Square,
  Circle,
  Type,
  Eraser,
  Trash2,
  Undo2,
  Redo2,
  Clock,
  X as CloseIcon,
  Minus,
  Download,
  Move,
  ZoomIn,
  ZoomOut,
} from "@tamagui/lucide-icons";
import type { CollabDocumentData, DocumentVersionData } from "../../../../../utils/api";
import { usePreferences } from "../../../../../utils/PreferencesContext";

type Tool = "pen" | "line" | "rectangle" | "ellipse" | "text" | "eraser";
type Color = string;

interface DrawAction {
  type: Tool;
  points?: { x: number; y: number }[];
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  color: string;
  lineWidth: number;
  text?: string;
}

interface RemoteCursor {
  userId: number;
  username: string;
  x: number;
  y: number;
}

interface WhiteboardEditorProps {
  document: CollabDocumentData;
  latestVersion: DocumentVersionData | null;
  onSave: (content: string) => void;
  onClose: () => void;
  isMobile: boolean;
  isSaving: boolean;
  onShowVersions?: () => void;
  onActionBroadcast?: (action: DrawAction) => void;
  remoteAction?: DrawAction | null;
  remoteActionVersion?: number;
  onUndoBroadcast?: () => void;
  onRedoBroadcast?: () => void;
  remoteUndo?: number;
  remoteRedo?: number;
  onCursorBroadcast?: (position: { x: number; y: number }) => void;
  remoteCursors?: RemoteCursor[];
}

const COLORS = ["#ffffff", "#EF4444", "#0EA5E9", "#10B981", "#F59E0B", "#000000", "#FF6B6B", "#4ECDC4"];
const LINE_WIDTHS = [2, 4, 8];
const CURSOR_COLORS = ["#EF4444", "#0EA5E9", "#10B981", "#F59E0B", "#FF6B6B", "#4ECDC4", "#9B59B6", "#E91E63"];

// ─── Helpers ────────────────────────────────────────────────────
/** Compute the bounding box of every action (used for full-content export) */
function computeContentBounds(actions: DrawAction[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const expand = (x: number, y: number, margin = 0) => {
    if (x - margin < minX) minX = x - margin;
    if (y - margin < minY) minY = y - margin;
    if (x + margin > maxX) maxX = x + margin;
    if (y + margin > maxY) maxY = y + margin;
  };

  for (const a of actions) {
    const m = a.lineWidth * (a.type === "eraser" ? 4 : 1);
    if (a.points) {
      for (const p of a.points) expand(p.x, p.y, m);
    }
    if (a.startX != null && a.startY != null) expand(a.startX, a.startY, m);
    if (a.endX != null && a.endY != null) expand(a.endX, a.endY, m);
    if (a.type === "text" && a.text && a.startX != null && a.startY != null) {
      // Rough text extent
      const fontSize = a.lineWidth * 6;
      expand(a.startX + a.text.length * fontSize * 0.6, a.startY + fontSize, m);
    }
  }

  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };

  const pad = 40;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Render all actions onto a context (shared by live canvas and export) */
function renderActions(ctx: CanvasRenderingContext2D, actions: DrawAction[], bg?: string) {
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  for (const action of actions) {
    ctx.strokeStyle = action.color;
    ctx.fillStyle = action.color;
    ctx.lineWidth = action.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (action.type) {
      case "pen":
        if (action.points && action.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(action.points[0].x, action.points[0].y);
          for (let i = 1; i < action.points.length; i++) {
            ctx.lineTo(action.points[i].x, action.points[i].y);
          }
          ctx.stroke();
        }
        break;
      case "eraser":
        if (action.points && action.points.length > 1) {
          ctx.save();
          ctx.strokeStyle = "#171823";
          ctx.lineWidth = action.lineWidth * 4;
          ctx.beginPath();
          ctx.moveTo(action.points[0].x, action.points[0].y);
          for (let i = 1; i < action.points.length; i++) {
            ctx.lineTo(action.points[i].x, action.points[i].y);
          }
          ctx.stroke();
          ctx.restore();
        }
        break;
      case "line":
        if (action.startX != null && action.endX != null) {
          ctx.beginPath();
          ctx.moveTo(action.startX, action.startY!);
          ctx.lineTo(action.endX, action.endY!);
          ctx.stroke();
        }
        break;
      case "rectangle":
        if (action.startX != null && action.endX != null) {
          const w = action.endX - action.startX;
          const h = action.endY! - action.startY!;
          ctx.strokeRect(action.startX, action.startY!, w, h);
        }
        break;
      case "ellipse":
        if (action.startX != null && action.endX != null) {
          const cx = (action.startX + action.endX) / 2;
          const cy = (action.startY! + action.endY!) / 2;
          const rx = Math.abs(action.endX - action.startX) / 2;
          const ry = Math.abs(action.endY! - action.startY!) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
          ctx.stroke();
        }
        break;
      case "text":
        if (action.text && action.startX != null) {
          ctx.font = `${action.lineWidth * 6}px sans-serif`;
          ctx.fillText(action.text, action.startX, action.startY!);
        }
        break;
    }
  }
}

const WhiteboardEditor: React.FC<WhiteboardEditorProps> = ({
  document: doc,
  latestVersion,
  onSave,
  onClose,
  isMobile,
  isSaving,
  onShowVersions,
  onActionBroadcast,
  remoteAction,
  remoteActionVersion,
  onUndoBroadcast,
  onRedoBroadcast,
  remoteUndo,
  remoteRedo,
  onCursorBroadcast,
  remoteCursors,
}) => {
  const { fontFamily } = usePreferences();
  const [tool, setTool] = useState<Tool>("pen");
  const [isPanning, setIsPanning] = useState(false);
  const [color, setColor] = useState("#ffffff");
  const [lineWidth, setLineWidth] = useState(2);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [undoneActions, setUndoneActions] = useState<DrawAction[]>([]);
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Pan & zoom state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCursorBroadcastRef = useRef(0);

  // Load from latest version
  useEffect(() => {
    if (latestVersion) {
      try {
        const parsed = JSON.parse(latestVersion.content);
        if (Array.isArray(parsed)) {
          setActions(parsed);
          setUndoneActions([]);
          setHasChanges(false);
        }
      } catch {
        setActions([]);
        setUndoneActions([]);
        setHasChanges(false);
      }
    } else {
      setActions([]);
      setUndoneActions([]);
      setHasChanges(false);
    }
  }, [latestVersion?.id]);

  // Auto-save after 30 seconds
  useEffect(() => {
    if (!hasChanges) return;
    autoSaveTimerRef.current = setTimeout(() => {
      onSave(JSON.stringify(actions));
      setHasChanges(false);
    }, 30000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [actions, hasChanges, onSave]);

  // Receive remote actions
  useEffect(() => {
    if (remoteActionVersion === undefined || !remoteAction) return;
    setActions((prev) => [...prev, remoteAction]);
    setUndoneActions([]);
  }, [remoteActionVersion]);

  // Receive remote undo
  useEffect(() => {
    if (remoteUndo === undefined || remoteUndo === 0) return;
    setActions((prev) => {
      if (prev.length === 0) return prev;
      const removed = prev[prev.length - 1];
      setUndoneActions((u) => [...u, removed]);
      return prev.slice(0, -1);
    });
  }, [remoteUndo]);

  // Receive remote redo
  useEffect(() => {
    if (remoteRedo === undefined || remoteRedo === 0) return;
    setUndoneActions((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      setActions((a) => [...a, restored]);
      return prev.slice(0, -1);
    });
  }, [remoteRedo]);

  // ─── Convert screen coords → canvas (world) coords ──────────
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (screenX - rect.left) / zoom - panOffset.x / zoom,
      y: (screenY - rect.top) / zoom - panOffset.y / zoom,
    };
  }, [zoom, panOffset]);

  // ─── Redraw canvas ──────────────────────────────────────────
  const redrawCanvas = useCallback(() => {
    if (Platform.OS !== "web" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear entire canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#171823";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply pan & zoom transform
    ctx.setTransform(zoom, 0, 0, zoom, panOffset.x, panOffset.y);

    // Draw all completed actions + current in-progress action
    const allActions = [...actions];
    if (currentAction) allActions.push(currentAction);
    renderActions(ctx, allActions);

    // Draw remote cursors (in world space)
    if (remoteCursors && remoteCursors.length > 0) {
      for (const cursor of remoteCursors) {
        const cursorColor = CURSOR_COLORS[cursor.userId % CURSOR_COLORS.length];
        ctx.beginPath();
        ctx.arc(cursor.x, cursor.y, 4 / zoom, 0, 2 * Math.PI);
        ctx.fillStyle = cursorColor;
        ctx.fill();
        ctx.font = `${11 / zoom}px sans-serif`;
        const textWidth = ctx.measureText(cursor.username).width;
        const labelX = cursor.x + 8 / zoom;
        const labelY = cursor.y - 8 / zoom;
        ctx.fillStyle = cursorColor;
        ctx.fillRect(labelX - 2 / zoom, labelY - 12 / zoom, textWidth + 8 / zoom, 16 / zoom);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(cursor.username, labelX + 2 / zoom, labelY);
      }
    }

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Draw zoom indicator (screen space, bottom-left)
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(8, canvas.height - 28, 70, 20);
    ctx.fillStyle = "#9CA3AF";
    ctx.font = "11px sans-serif";
    ctx.fillText(`${Math.round(zoom * 100)}%`, 14, canvas.height - 13);
  }, [actions, currentAction, remoteCursors, zoom, panOffset]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Resize canvas to fill container
  useEffect(() => {
    if (Platform.OS !== "web" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      redrawCanvas();
    }
    const handleResize = () => {
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        redrawCanvas();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [redrawCanvas]);

  // ─── Wheel zoom ─────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom towards mouse position
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((prev) => {
        const newZoom = Math.min(Math.max(prev * zoomFactor, 0.1), 10);
        const scale = newZoom / prev;
        setPanOffset((off) => ({
          x: mouseX - scale * (mouseX - off.x),
          y: mouseY - scale * (mouseY - off.y),
        }));
        return newZoom;
      });
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // ─── 3-finger touch panning ─────────────────────────────────
  const touchPanRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !canvasRef.current) return;
    const canvas = canvasRef.current;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 3) {
        e.preventDefault();
        const avgX = Array.from(e.touches).reduce((s, t) => s + t.clientX, 0) / e.touches.length;
        const avgY = Array.from(e.touches).reduce((s, t) => s + t.clientY, 0) / e.touches.length;
        touchPanRef.current = { startX: avgX, startY: avgY, offsetX: panOffset.x, offsetY: panOffset.y };
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 3 && touchPanRef.current) {
        e.preventDefault();
        const avgX = Array.from(e.touches).reduce((s, t) => s + t.clientX, 0) / e.touches.length;
        const avgY = Array.from(e.touches).reduce((s, t) => s + t.clientY, 0) / e.touches.length;
        setPanOffset({
          x: touchPanRef.current.offsetX + (avgX - touchPanRef.current.startX),
          y: touchPanRef.current.offsetY + (avgY - touchPanRef.current.startY),
        });
      }
    };
    const handleTouchEnd = () => {
      touchPanRef.current = null;
    };

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd);
    canvas.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [panOffset]);

  // ─── Arrow key panning ──────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const PAN_STEP = 40;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only pan if not typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          setPanOffset((off) => ({ ...off, x: off.x + PAN_STEP }));
          break;
        case "ArrowRight":
          e.preventDefault();
          setPanOffset((off) => ({ ...off, x: off.x - PAN_STEP }));
          break;
        case "ArrowUp":
          e.preventDefault();
          setPanOffset((off) => ({ ...off, y: off.y + PAN_STEP }));
          break;
        case "ArrowDown":
          e.preventDefault();
          setPanOffset((off) => ({ ...off, y: off.y - PAN_STEP }));
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ─── Pointer handlers ──────────────────────────────────────
  const handlePointerDown = (e: any) => {
    if (Platform.OS !== "web") return;

    // Middle-click or pan mode → start panning
    if (e.button === 1 || isPanning) {
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        offsetX: panOffset.x,
        offsetY: panOffset.y,
      };
      return;
    }

    isDrawingRef.current = true;
    const pos = screenToWorld(e.clientX, e.clientY);

    if (tool === "text") {
      const text = prompt("Enter text:");
      if (text) {
        const newAction: DrawAction = {
          type: "text",
          startX: pos.x,
          startY: pos.y,
          color,
          lineWidth,
          text,
        };
        setActions((prev) => [...prev, newAction]);
        setHasChanges(true);
        onActionBroadcast?.(newAction);
      }
      return;
    }

    if (tool === "pen" || tool === "eraser") {
      setCurrentAction({ type: tool, points: [pos], color, lineWidth });
    } else {
      setCurrentAction({ type: tool, startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y, color, lineWidth });
    }
  };

  const handlePointerMove = (e: any) => {
    // Panning
    if (isPanningRef.current) {
      setPanOffset({
        x: panStartRef.current.offsetX + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.offsetY + (e.clientY - panStartRef.current.y),
      });
      return;
    }

    // Broadcast cursor position (throttled 100ms) in world coords
    const pos = screenToWorld(e.clientX, e.clientY);
    const now = Date.now();
    if (onCursorBroadcast && now - lastCursorBroadcastRef.current > 100) {
      lastCursorBroadcastRef.current = now;
      onCursorBroadcast({ x: pos.x, y: pos.y });
    }

    if (!isDrawingRef.current || !currentAction) return;

    if (currentAction.type === "pen" || currentAction.type === "eraser") {
      setCurrentAction((prev) => ({
        ...prev!,
        points: [...(prev!.points || []), pos],
      }));
    } else {
      setCurrentAction((prev) => ({
        ...prev!,
        endX: pos.x,
        endY: pos.y,
      }));
    }
  };

  const handlePointerUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }
    if (!isDrawingRef.current || !currentAction) return;
    isDrawingRef.current = false;
    const completedAction = currentAction;
    setActions((prev) => [...prev, completedAction]);
    setCurrentAction(null);
    setHasChanges(true);
    setUndoneActions([]);
    onActionBroadcast?.(completedAction);
  };

  const handleUndo = () => {
    setActions((prev) => {
      if (prev.length === 0) return prev;
      const removed = prev[prev.length - 1];
      setUndoneActions((u) => [...u, removed]);
      return prev.slice(0, -1);
    });
    setHasChanges(true);
    onUndoBroadcast?.();
  };

  const handleRedo = () => {
    setUndoneActions((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      setActions((a) => [...a, restored]);
      return prev.slice(0, -1);
    });
    setHasChanges(true);
    onRedoBroadcast?.();
  };

  const handleClear = () => {
    setActions([]);
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(JSON.stringify(actions));
    setHasChanges(false);
  };

  // ─── Export full content (not just viewport) ────────────────
  const handleExport = () => {
    if (Platform.OS !== "web") return;
    if (actions.length === 0) {
      // Nothing to export — fall back to current canvas
      if (!canvasRef.current) return;
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const a = window.document.createElement("a");
      a.href = dataUrl;
      a.download = `${doc.title.replace(/[^a-z0-9]/gi, "_")}.png`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      return;
    }

    const bounds = computeContentBounds(actions);
    const width = Math.ceil(bounds.maxX - bounds.minX);
    const height = Math.ceil(bounds.maxY - bounds.minY);

    const offscreen = window.document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;

    // Fill background BEFORE translating (covers the full offscreen canvas)
    ctx.fillStyle = "#171823";
    ctx.fillRect(0, 0, width, height);

    // Translate so that content starts at (0,0), then draw without bg
    ctx.translate(-bounds.minX, -bounds.minY);
    renderActions(ctx, actions);

    const dataUrl = offscreen.toDataURL("image/png");
    const a = window.document.createElement("a");
    a.href = dataUrl;
    a.download = `${doc.title.replace(/[^a-z0-9]/gi, "_")}.png`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  };

  // ─── Zoom controls ─────────────────────────────────────────
  const handleZoomIn = () => {
    setZoom((z) => Math.min(z * 1.25, 10));
  };
  const handleZoomOut = () => {
    setZoom((z) => Math.max(z * 0.8, 0.1));
  };
  const handleResetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const getCursorStyle = () => {
    if (isPanning) return "grab";
    if (tool === "text") return "text";
    return "crosshair";
  };

  const ToolButton = ({ t, icon, label }: { t: Tool; icon: React.ReactNode; label: string }) => (
    <Button
      size="$2"
      backgroundColor={tool === t && !isPanning ? "#0EA5E9" : "transparent"}
      onPress={() => { setTool(t); setIsPanning(false); }}
      icon={icon as any}
      accessibilityLabel={label}
    />
  );

  return (
    <YStack flex={1} backgroundColor="#1E1F2B">
      {/* Toolbar */}
      <XStack
        paddingHorizontal="$2"
        paddingVertical="$2"
        backgroundColor="#171823"
        borderBottomWidth={1}
        borderBottomColor="#2D2E3F"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap="$1"
      >
        <XStack alignItems="center" gap="$1" flex={1}>
          <Text color="white" fontSize={14} fontWeight="600" numberOfLines={1} fontFamily={fontFamily}>
            {doc.title}
          </Text>
          {hasChanges && <Text color="#F59E0B" fontSize={11} fontFamily={fontFamily}>(unsaved)</Text>}
          {isSaving && <Text color="#10B981" fontSize={11} fontFamily={fontFamily}>Saving...</Text>}
        </XStack>

        <XStack gap="$1" alignItems="center" flexWrap="wrap">
          {/* Drawing tools */}
          <ToolButton t="pen" icon={<Pencil size={14} color="white" />} label="Pen" />
          <ToolButton t="line" icon={<Minus size={14} color="white" />} label="Line" />
          <ToolButton t="rectangle" icon={<Square size={14} color="white" />} label="Rectangle" />
          <ToolButton t="ellipse" icon={<Circle size={14} color="white" />} label="Ellipse" />
          <ToolButton t="text" icon={<Type size={14} color="white" />} label="Text" />
          <ToolButton t="eraser" icon={<Eraser size={14} color="white" />} label="Eraser" />

          {/* Pan mode toggle */}
          <Button
            size="$2"
            backgroundColor={isPanning ? "#0EA5E9" : "transparent"}
            onPress={() => setIsPanning((p) => !p)}
            icon={<Move size={14} color="white" />}
            accessibilityLabel="Pan"
          />

          {/* Zoom controls */}
          <Button size="$2" backgroundColor="transparent" onPress={handleZoomOut}>
            <ZoomOut size={14} color="#9CA3AF" />
          </Button>
          <Button
            size="$2"
            backgroundColor="transparent"
            onPress={handleResetView}
            paddingHorizontal="$1"
          >
            <Text color="#9CA3AF" fontSize={10} fontFamily={fontFamily}>{Math.round(zoom * 100)}%</Text>
          </Button>
          <Button size="$2" backgroundColor="transparent" onPress={handleZoomIn}>
            <ZoomIn size={14} color="#9CA3AF" />
          </Button>

          {/* Color picker */}
          <XStack gap={2} marginLeft="$1">
            {COLORS.map((c) => (
              <Button
                key={c}
                size="$1"
                width={20}
                height={20}
                padding={0}
                backgroundColor={c}
                borderWidth={color === c ? 2 : 1}
                borderColor={color === c ? "#0EA5E9" : "#4B5563"}
                borderRadius={10}
                onPress={() => setColor(c)}
              />
            ))}
          </XStack>

          {/* Line width */}
          <XStack gap={2} marginLeft="$1">
            {LINE_WIDTHS.map((lw) => (
              <Button
                key={lw}
                size="$2"
                backgroundColor={lineWidth === lw ? "#0EA5E9" : "transparent"}
                onPress={() => setLineWidth(lw)}
              >
                <Text color="white" fontSize={10} fontFamily={fontFamily}>{lw}px</Text>
              </Button>
            ))}
          </XStack>

          <Button
            size="$2"
            backgroundColor="transparent"
            onPress={handleUndo}
            disabled={actions.length === 0}
            opacity={actions.length === 0 ? 0.3 : 1}
          >
            <Undo2 size={14} color="#9CA3AF" />
          </Button>
          <Button
            size="$2"
            backgroundColor="transparent"
            onPress={handleRedo}
            disabled={undoneActions.length === 0}
            opacity={undoneActions.length === 0 ? 0.3 : 1}
          >
            <Redo2 size={14} color="#9CA3AF" />
          </Button>
          <Button size="$2" backgroundColor="transparent" onPress={handleClear}>
            <Trash2 size={14} color="#EF4444" />
          </Button>

          {onShowVersions && (
            <Button
              size="$2"
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="#0EA5E9"
              onPress={onShowVersions}
              icon={<Clock size={14} color="#0EA5E9" />}
            />
          )}

          <Button
            size="$2"
            backgroundColor="#0EA5E9"
            onPress={handleSave}
            disabled={!hasChanges || isSaving}
            opacity={!hasChanges ? 0.5 : 1}
            icon={<Save size={14} color="white" />}
          />

          {Platform.OS === "web" && (
            <Button size="$2" backgroundColor="transparent" onPress={handleExport}>
              <Download size={14} color="#10B981" />
            </Button>
          )}

          <Button size="$2" backgroundColor="transparent" onPress={onClose}>
            <CloseIcon size={16} color="#9CA3AF" />
          </Button>
        </XStack>
      </XStack>

      {/* Canvas */}
      {Platform.OS === "web" ? (
        <div
          style={{
            flex: 1,
            position: "relative",
            cursor: getCursorStyle(),
            overflow: "hidden",
          }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            style={{ display: "block" }}
          />
        </div>
      ) : (
        <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="#171823">
          <Text color="#6B7280" fontSize={14} textAlign="center" padding="$4" fontFamily={fontFamily}>
            Whiteboard is best experienced on web.{"\n"}
            Open this document on a desktop browser for the full drawing experience.
          </Text>
        </YStack>
      )}
    </YStack>
  );
};

export default React.memo(WhiteboardEditor);
