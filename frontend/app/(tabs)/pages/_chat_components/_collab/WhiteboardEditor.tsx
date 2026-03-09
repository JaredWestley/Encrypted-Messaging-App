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
} from "@tamagui/lucide-icons";
import type { CollabDocumentData, DocumentVersionData } from "../../../../../utils/api";

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
  // Real-time collaboration props
  onActionBroadcast?: (action: DrawAction) => void;
  remoteAction?: DrawAction | null;
  remoteActionVersion?: number;
  // Undo/redo sync
  onUndoBroadcast?: () => void;
  onRedoBroadcast?: () => void;
  remoteUndo?: number;
  remoteRedo?: number;
  // Cursor presence
  onCursorBroadcast?: (position: { x: number; y: number }) => void;
  remoteCursors?: RemoteCursor[];
}

const COLORS = ["#ffffff", "#ED4245", "#5865F2", "#43B581", "#FAA61A", "#000000", "#FF6B6B", "#4ECDC4"];
const LINE_WIDTHS = [2, 4, 8];
const CURSOR_COLORS = ["#ED4245", "#5865F2", "#43B581", "#FAA61A", "#FF6B6B", "#4ECDC4", "#9B59B6", "#E91E63"];

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
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ffffff");
  const [lineWidth, setLineWidth] = useState(2);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [undoneActions, setUndoneActions] = useState<DrawAction[]>([]);
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
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

  // Receive remote actions from other users
  useEffect(() => {
    if (remoteActionVersion === undefined || !remoteAction) return;
    setActions((prev) => [...prev, remoteAction]);
    setUndoneActions([]); // New drawing invalidates redo stack
    // Don't set hasChanges — remote actions don't trigger local auto-save
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

  // Redraw canvas whenever actions change
  const redrawCanvas = useCallback(() => {
    if (Platform.OS !== "web" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.fillStyle = "#2f3136";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw all completed actions
    const allActions = [...actions];
    if (currentAction) allActions.push(currentAction);

    for (const action of allActions) {
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
            ctx.strokeStyle = "#2f3136";
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

    // Draw remote cursor indicators
    if (remoteCursors && remoteCursors.length > 0) {
      for (const cursor of remoteCursors) {
        const cursorColor = CURSOR_COLORS[cursor.userId % CURSOR_COLORS.length];
        // Draw cursor dot
        ctx.beginPath();
        ctx.arc(cursor.x, cursor.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = cursorColor;
        ctx.fill();
        // Draw name label
        ctx.font = "11px sans-serif";
        const textWidth = ctx.measureText(cursor.username).width;
        const labelX = cursor.x + 8;
        const labelY = cursor.y - 8;
        ctx.fillStyle = cursorColor;
        ctx.fillRect(labelX - 2, labelY - 12, textWidth + 8, 16);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(cursor.username, labelX + 2, labelY);
      }
    }
  }, [actions, currentAction, remoteCursors]);

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

  const getCanvasPos = (e: any) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX || e.pageX) - rect.left,
      y: (e.clientY || e.pageY) - rect.top,
    };
  };

  const handlePointerDown = (e: any) => {
    if (Platform.OS !== "web") return;
    isDrawingRef.current = true;
    const pos = getCanvasPos(e);

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
      }
      return;
    }

    if (tool === "pen" || tool === "eraser") {
      setCurrentAction({
        type: tool,
        points: [pos],
        color,
        lineWidth,
      });
    } else {
      setCurrentAction({
        type: tool,
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y,
        color,
        lineWidth,
      });
    }
  };

  const handlePointerMove = (e: any) => {
    // Broadcast cursor position (throttled to 100ms)
    const pos = getCanvasPos(e);
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
    if (!isDrawingRef.current || !currentAction) return;
    isDrawingRef.current = false;
    const completedAction = currentAction;
    setActions((prev) => [...prev, completedAction]);
    setCurrentAction(null);
    setHasChanges(true);
    setUndoneActions([]); // New drawing clears redo stack
    // Broadcast completed action to other users
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

  const handleExport = () => {
    if (Platform.OS !== "web" || !canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const a = window.document.createElement("a");
    a.href = dataUrl;
    a.download = `${doc.title.replace(/[^a-z0-9]/gi, "_")}.png`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  };

  const ToolButton = ({ t, icon, label }: { t: Tool; icon: React.ReactNode; label: string }) => (
    <Button
      size="$2"
      backgroundColor={tool === t ? "#5865F2" : "transparent"}
      onPress={() => setTool(t)}
      icon={icon as any}
      accessibilityLabel={label}
    />
  );

  return (
    <YStack flex={1} backgroundColor="#36393f">
      {/* Toolbar */}
      <XStack
        paddingHorizontal="$2"
        paddingVertical="$2"
        backgroundColor="#2f3136"
        borderBottomWidth={1}
        borderBottomColor="#202225"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap="$1"
      >
        <XStack alignItems="center" gap="$1" flex={1}>
          <Text color="white" fontSize={14} fontWeight="600" numberOfLines={1}>
            {doc.title}
          </Text>
          {hasChanges && <Text color="#FAA61A" fontSize={11}>(unsaved)</Text>}
          {isSaving && <Text color="#43B581" fontSize={11}>Saving...</Text>}
        </XStack>

        <XStack gap="$1" alignItems="center" flexWrap="wrap">
          {/* Tool buttons */}
          <ToolButton t="pen" icon={<Pencil size={14} color="white" />} label="Pen" />
          <ToolButton t="line" icon={<Minus size={14} color="white" />} label="Line" />
          <ToolButton t="rectangle" icon={<Square size={14} color="white" />} label="Rectangle" />
          <ToolButton t="ellipse" icon={<Circle size={14} color="white" />} label="Ellipse" />
          <ToolButton t="text" icon={<Type size={14} color="white" />} label="Text" />
          <ToolButton t="eraser" icon={<Eraser size={14} color="white" />} label="Eraser" />

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
                borderColor={color === c ? "#5865F2" : "#555"}
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
                backgroundColor={lineWidth === lw ? "#5865F2" : "transparent"}
                onPress={() => setLineWidth(lw)}
              >
                <Text color="white" fontSize={10}>{lw}px</Text>
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
            <Undo2 size={14} color="#b9bbbe" />
          </Button>
          <Button
            size="$2"
            backgroundColor="transparent"
            onPress={handleRedo}
            disabled={undoneActions.length === 0}
            opacity={undoneActions.length === 0 ? 0.3 : 1}
          >
            <Redo2 size={14} color="#b9bbbe" />
          </Button>
          <Button size="$2" backgroundColor="transparent" onPress={handleClear}>
            <Trash2 size={14} color="#ED4245" />
          </Button>

          {onShowVersions && (
            <Button
              size="$2"
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="#5865F2"
              onPress={onShowVersions}
              icon={<Clock size={14} color="#5865F2" />}
            />
          )}

          <Button
            size="$2"
            backgroundColor="#5865F2"
            onPress={handleSave}
            disabled={!hasChanges || isSaving}
            opacity={!hasChanges ? 0.5 : 1}
            icon={<Save size={14} color="white" />}
          />

          {Platform.OS === "web" && (
            <Button size="$2" backgroundColor="transparent" onPress={handleExport}>
              <Download size={14} color="#43B581" />
            </Button>
          )}

          <Button size="$2" backgroundColor="transparent" onPress={onClose}>
            <CloseIcon size={16} color="#b9bbbe" />
          </Button>
        </XStack>
      </XStack>

      {/* Canvas */}
      {Platform.OS === "web" ? (
        <div
          style={{
            flex: 1,
            position: "relative",
            cursor: tool === "text" ? "text" : "crosshair",
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
        <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="#2f3136">
          <Text color="#72767d" fontSize={14} textAlign="center" padding="$4">
            Whiteboard is best experienced on web.{"\n"}
            Open this document on a desktop browser for the full drawing experience.
          </Text>
        </YStack>
      )}
    </YStack>
  );
};

export default React.memo(WhiteboardEditor);
