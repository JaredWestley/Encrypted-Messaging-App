import React, { useState, useRef, useEffect, useCallback } from "react";
import { Platform, ScrollView, TextInput as RNTextInput } from "react-native";
import { YStack, XStack, Text, Button } from "tamagui";
import {
  Save,
  Bold,
  Italic,
  List,
  Heading,
  Code,
  Undo2,
  Redo2,
  Clock,
  X as CloseIcon,
  Download,
} from "@tamagui/lucide-icons";
import { asBlob } from "html-docx-js-typescript";
import type { CollabDocumentData, DocumentVersionData } from "../../../../../utils/api";
import { usePreferences } from "../../../../../utils/PreferencesContext";

interface RemoteCursor {
  userId: number;
  username: string;
  offset: number;
}

const CURSOR_COLORS = ["#EF4444", "#0EA5E9", "#10B981", "#F59E0B", "#FF6B6B", "#4ECDC4", "#9B59B6", "#E91E63"];

interface DocumentEditorProps {
  document: CollabDocumentData;
  latestVersion: DocumentVersionData | null;
  onSave: (content: string) => void;
  onClose: () => void;
  isMobile: boolean;
  isSaving: boolean;
  onShowVersions?: () => void;
  // Real-time collaboration props
  onContentBroadcast?: (content: string) => void;
  remoteContent?: string;
  remoteContentVersion?: number;
  // Cursor presence
  onCursorBroadcast?: (offset: number) => void;
  remoteCursors?: RemoteCursor[];
}

// ─── Cursor helpers for contentEditable ─────────────────────────
// Convert the current Selection to a character offset from the start of the container
function getCursorCharOffset(container: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return -1;
  const range = sel.getRangeAt(0);
  const preRange = window.document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

// Restore cursor to a character offset within the container
function restoreCursorCharOffset(container: HTMLElement, offset: number) {
  if (offset < 0) return;
  const sel = window.getSelection();
  if (!sel) return;

  const walker = window.document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let charCount = 0;
  let node: Node | null = null;

  while ((node = walker.nextNode())) {
    const nodeLen = (node.textContent || "").length;
    if (charCount + nodeLen >= offset) {
      const range = window.document.createRange();
      range.setStart(node, offset - charCount);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    charCount += nodeLen;
  }

  // If offset exceeds content length, place cursor at the end
  const range = window.document.createRange();
  range.selectNodeContents(container);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

const DocumentEditor: React.FC<DocumentEditorProps> = ({
  document: doc,
  latestVersion,
  onSave,
  onClose,
  isMobile,
  isSaving,
  onShowVersions,
  onContentBroadcast,
  remoteContent,
  remoteContentVersion,
  onCursorBroadcast,
  remoteCursors,
}) => {
  const { fontFamily } = usePreferences();
  // Content is stored in a ref (NOT state) to avoid re-rendering the contentEditable div
  const contentRef = useRef("");
  // Native-only: use state for TextInput (controlled component is fine for native)
  const [nativeContent, setNativeContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const cursorOverlayRef = useRef<HTMLDivElement | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCursorBroadcastRef = useRef(0);

  // Load content from latest version — imperatively set innerHTML (web) or state (native)
  useEffect(() => {
    const newContent = latestVersion?.content || "";
    contentRef.current = newContent;
    if (Platform.OS === "web") {
      if (editorRef.current) {
        editorRef.current.innerHTML = newContent;
      }
    } else {
      setNativeContent(newContent);
    }
    setHasChanges(false);
  }, [latestVersion?.id]);

  // Auto-save after 30 seconds of inactivity
  useEffect(() => {
    if (!hasChanges) return;
    autoSaveTimerRef.current = setTimeout(() => {
      onSave(contentRef.current);
      setHasChanges(false);
    }, 30000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [hasChanges, onSave]);

  // Web: read innerHTML from the DOM directly — no state update, no re-render
  const handleContentChange = useCallback(() => {
    if (Platform.OS === "web" && editorRef.current) {
      contentRef.current = editorRef.current.innerHTML || "";
      setHasChanges(true);
      // Throttled broadcast to other users (500ms)
      if (onContentBroadcast) {
        if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
        broadcastTimerRef.current = setTimeout(() => {
          onContentBroadcast(contentRef.current);
        }, 500);
      }
    }
  }, [onContentBroadcast]);

  // Native: TextInput onChange
  const handleNativeContentChange = useCallback((text: string) => {
    contentRef.current = text;
    setNativeContent(text);
    setHasChanges(true);
    if (onContentBroadcast) {
      if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
      broadcastTimerRef.current = setTimeout(() => {
        onContentBroadcast(contentRef.current);
      }, 500);
    }
  }, [onContentBroadcast]);

  const handleSave = useCallback(() => {
    onSave(contentRef.current);
    setHasChanges(false);
  }, [onSave]);

  const handleExport = useCallback(async () => {
    if (Platform.OS !== "web") return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${doc.title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;max-width:800px;margin:0 auto;line-height:1.6;color:#333;}</style></head><body>${contentRef.current}</body></html>`;
    try {
      const blob = await asBlob(html) as Blob;
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${doc.title.replace(/[^a-z0-9]/gi, "_")}.docx`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback to HTML if DOCX conversion fails
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${doc.title.replace(/[^a-z0-9]/gi, "_")}.html`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [doc.title]);

  // Web-only: Execute formatting commands on contentEditable
  const execCommand = useCallback((command: string, value?: string) => {
    if (Platform.OS === "web") {
      // Re-focus the editor before executing the command so it applies to the selection
      editorRef.current?.focus();
      (window.document as any).execCommand(command, false, value || "");
      // Sync the ref after formatting
      if (editorRef.current) {
        contentRef.current = editorRef.current.innerHTML || "";
        setHasChanges(true);
      }
    }
  }, []);

  // Receive remote edits — save/restore cursor position
  useEffect(() => {
    if (remoteContentVersion === undefined || remoteContent === undefined) return;
    if (Platform.OS === "web" && editorRef.current) {
      const cursorOffset = getCursorCharOffset(editorRef.current);
      editorRef.current.innerHTML = remoteContent;
      contentRef.current = remoteContent;
      restoreCursorCharOffset(editorRef.current, cursorOffset);
    } else {
      contentRef.current = remoteContent;
      setNativeContent(remoteContent);
    }
  }, [remoteContentVersion]);

  // Cleanup broadcast timer on unmount
  useEffect(() => {
    return () => {
      if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    };
  }, []);

  // Broadcast cursor position on selection change (throttled 100ms)
  const broadcastCursorPosition = useCallback(() => {
    if (Platform.OS !== "web" || !editorRef.current || !onCursorBroadcast) return;
    const now = Date.now();
    if (now - lastCursorBroadcastRef.current < 100) return;
    lastCursorBroadcastRef.current = now;
    const offset = getCursorCharOffset(editorRef.current);
    if (offset >= 0) onCursorBroadcast(offset);
  }, [onCursorBroadcast]);

  // Render remote cursor indicators into the overlay
  useEffect(() => {
    if (Platform.OS !== "web" || !cursorOverlayRef.current || !editorRef.current) return;
    const overlay = cursorOverlayRef.current;
    // Clear previous cursors
    overlay.innerHTML = "";
    if (!remoteCursors || remoteCursors.length === 0) return;

    const editor = editorRef.current;

    for (const cursor of remoteCursors) {
      // Find position using Range API
      const walker = window.document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
      let charCount = 0;
      let node: Node | null = null;
      let found = false;

      while ((node = walker.nextNode())) {
        const nodeLen = (node.textContent || "").length;
        if (charCount + nodeLen >= cursor.offset) {
          try {
            const range = window.document.createRange();
            range.setStart(node, Math.min(cursor.offset - charCount, nodeLen));
            range.collapse(true);
            const rect = range.getBoundingClientRect();
            const editorRect = editor.getBoundingClientRect();
            const color = CURSOR_COLORS[cursor.userId % CURSOR_COLORS.length];

            // Cursor line
            const line = window.document.createElement("div");
            line.style.cssText = `position:absolute;left:${rect.left - editorRect.left}px;top:${rect.top - editorRect.top}px;width:2px;height:${rect.height || 18}px;background:${color};pointer-events:none;`;

            // Name label
            const label = window.document.createElement("div");
            label.style.cssText = `position:absolute;left:${rect.left - editorRect.left}px;top:${rect.top - editorRect.top - 18}px;background:${color};color:#fff;font-size:10px;padding:1px 4px;border-radius:2px;pointer-events:none;white-space:nowrap;font-family:sans-serif;`;
            label.textContent = cursor.username;

            overlay.appendChild(line);
            overlay.appendChild(label);
            found = true;
          } catch {
            // Range error, skip
          }
          break;
        }
        charCount += nodeLen;
      }

      // If offset is beyond content, place at end
      if (!found && editor.lastChild) {
        try {
          const range = window.document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          const rect = range.getBoundingClientRect();
          const editorRect = editor.getBoundingClientRect();
          const color = CURSOR_COLORS[cursor.userId % CURSOR_COLORS.length];

          const line = window.document.createElement("div");
          line.style.cssText = `position:absolute;left:${rect.left - editorRect.left}px;top:${rect.top - editorRect.top}px;width:2px;height:${rect.height || 18}px;background:${color};pointer-events:none;`;
          const label = window.document.createElement("div");
          label.style.cssText = `position:absolute;left:${rect.left - editorRect.left}px;top:${rect.top - editorRect.top - 18}px;background:${color};color:#fff;font-size:10px;padding:1px 4px;border-radius:2px;pointer-events:none;white-space:nowrap;font-family:sans-serif;`;
          label.textContent = cursor.username;
          overlay.appendChild(line);
          overlay.appendChild(label);
        } catch {
          // Skip
        }
      }
    }
  }, [remoteCursors]);

  return (
    <YStack flex={1} backgroundColor="#1E1F2B">
      {/* Toolbar */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        backgroundColor="#171823"
        borderBottomWidth={1}
        borderBottomColor="#2D2E3F"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap="$1"
      >
        <XStack alignItems="center" gap="$2" flex={1}>
          <Text color="white" fontSize={14} fontWeight="600" numberOfLines={1} fontFamily={fontFamily}>
            {doc.title}
          </Text>
          {hasChanges && (
            <Text color="#F59E0B" fontSize={11} fontFamily={fontFamily}>
              (unsaved)
            </Text>
          )}
          {isSaving && (
            <Text color="#10B981" fontSize={11} fontFamily={fontFamily}>
              Saving...
            </Text>
          )}
        </XStack>

        <XStack gap="$1" alignItems="center">
          {/* Formatting buttons (web only) */}
          {Platform.OS === "web" && (
            <>
              <Button size="$2" backgroundColor="transparent" onPress={() => execCommand("bold")}>
                <Bold size={14} color="#9CA3AF" />
              </Button>
              <Button size="$2" backgroundColor="transparent" onPress={() => execCommand("italic")}>
                <Italic size={14} color="#9CA3AF" />
              </Button>
              <Button size="$2" backgroundColor="transparent" onPress={() => execCommand("insertUnorderedList")}>
                <List size={14} color="#9CA3AF" />
              </Button>
              <Button size="$2" backgroundColor="transparent" onPress={() => execCommand("formatBlock", "h2")}>
                <Heading size={14} color="#9CA3AF" />
              </Button>
              <Button size="$2" backgroundColor="transparent" onPress={() => execCommand("formatBlock", "pre")}>
                <Code size={14} color="#9CA3AF" />
              </Button>
              <Button size="$2" backgroundColor="transparent" onPress={() => execCommand("undo")}>
                <Undo2 size={14} color="#9CA3AF" />
              </Button>
              <Button size="$2" backgroundColor="transparent" onPress={() => execCommand("redo")}>
                <Redo2 size={14} color="#9CA3AF" />
              </Button>
            </>
          )}

          {onShowVersions && (
            <Button
              size="$2"
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="#0EA5E9"
              onPress={onShowVersions}
              icon={<Clock size={14} color="#0EA5E9" />}
            >
              {!isMobile && <Text color="#0EA5E9" fontSize={11} fontFamily={fontFamily}>Versions</Text>}
            </Button>
          )}

          <Button
            size="$2"
            backgroundColor="#0EA5E9"
            onPress={handleSave}
            disabled={!hasChanges || isSaving}
            opacity={!hasChanges ? 0.5 : 1}
            icon={<Save size={14} color="white" />}
          >
            {!isMobile && <Text color="white" fontSize={11} fontFamily={fontFamily}>Save</Text>}
          </Button>

          {Platform.OS === "web" && (
            <Button size="$2" backgroundColor="transparent" onPress={handleExport}>
              <Download size={14} color="#10B981" />
            </Button>
          )}

          <Button
            size="$2"
            backgroundColor="transparent"
            onPress={onClose}
          >
            <CloseIcon size={16} color="#9CA3AF" />
          </Button>
        </XStack>
      </XStack>

      {/* Editor Area */}
      {Platform.OS === "web" ? (
        <ScrollView style={{ flex: 1 }}>
          <div style={{ position: "relative" }}>
            <div
              ref={(el) => { editorRef.current = el; }}
              contentEditable
              suppressContentEditableWarning
              onInput={handleContentChange}
              onKeyUp={broadcastCursorPosition}
              onMouseUp={broadcastCursorPosition}
              style={{
                minHeight: "100%",
                padding: 24,
                color: "#D1D5DB",
                fontSize: 15,
                lineHeight: 1.6,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                outline: "none",
                backgroundColor: "#1E1F2B",
              }}
            />
            {/* Remote cursor overlay */}
            <div
              ref={(el) => { cursorOverlayRef.current = el; }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <RNTextInput
            multiline
            value={nativeContent}
            onChangeText={handleNativeContentChange}
            placeholder="Start typing..."
            placeholderTextColor="#6B7280"
            style={{
              flex: 1,
              minHeight: 400,
              padding: 16,
              color: "#D1D5DB",
              fontSize: 15,
              lineHeight: 24,
              textAlignVertical: "top",
            }}
          />
        </ScrollView>
      )}
    </YStack>
  );
};

export default React.memo(DocumentEditor);
