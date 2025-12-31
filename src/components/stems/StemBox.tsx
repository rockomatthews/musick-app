"use client";

import * as React from "react";
import { Avatar, Box, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopIcon from "@mui/icons-material/Stop";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import LockIcon from "@mui/icons-material/Lock";
import type { StemType } from "@/lib/stems/types";

export type StemBoxStatus = "empty" | "pending" | "approved";

export function StemBox(props: {
  stemType: StemType;
  columnIndex: number;
  status: StemBoxStatus;
  onAiMidi?: (stemType: StemType, columnIndex: number) => void;
  isRecording?: boolean;
  onRecordToggle?: (stemType: StemType, columnIndex: number) => void;
  canPlay?: boolean;
  isPlaying?: boolean;
  onPlayToggle?: (stemType: StemType, columnIndex: number) => void;
  submissions?: { userId: string; label: string; avatarUrl: string | null; stemId: string; locked: boolean }[];
  isOwner?: boolean;
  onLockStem?: (stemId: string) => void;
  onPlayStem?: (stemId: string) => void;
}) {
  const label =
    props.status === "empty" ? "Empty" : props.status === "pending" ? "Pending approval" : "Approved";

  const color =
    props.status === "approved" ? "success" : props.status === "pending" ? "warning" : "default";

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        minHeight: 92,
        display: "flex",
        alignItems: "center",
        cursor: props.onRecordToggle ? "pointer" : "default",
      }}
      onClick={() => props.onRecordToggle?.(props.stemType, props.columnIndex)}
    >
      <Stack spacing={1} sx={{ width: "100%" }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography fontWeight={800} variant="body2">
            {props.columnIndex + 1}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            {props.onPlayToggle ? (
              <Tooltip title={props.isPlaying ? "Stop" : props.canPlay ? "Play" : "Nothing to play yet"}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!props.canPlay}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onPlayToggle?.(props.stemType, props.columnIndex);
                    }}
                  >
                    {props.isPlaying ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
            {props.onRecordToggle ? (
              <Tooltip title={props.isRecording ? "Stop recording" : "Record"}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onRecordToggle?.(props.stemType, props.columnIndex);
                  }}
                >
                  {props.isRecording ? <StopIcon fontSize="small" /> : <FiberManualRecordIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            ) : null}
            {props.onAiMidi ? (
              <Tooltip title="AI MIDI (Magenta)">
                <IconButton size="small" onClick={() => props.onAiMidi?.(props.stemType, props.columnIndex)}>
                  <AutoAwesomeIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            <Chip size="small" label={label} color={color} variant={props.status === "empty" ? "outlined" : "filled"} />
          </Stack>
        </Stack>

        {props.submissions && props.submissions.length > 0 ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ overflowX: "auto", pb: 0.25 }}>
            {props.submissions.slice(0, 8).map((s) => (
              <Tooltip key={s.stemId} title={s.locked ? `${s.label} (locked)` : s.label}>
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onPlayStem?.(s.stemId);
                    }}
                    sx={{ p: 0 }}
                  >
                    <Avatar src={s.avatarUrl ?? undefined} sx={{ width: 26, height: 26, fontSize: 12 }}>
                      {s.label.slice(0, 1).toUpperCase()}
                    </Avatar>
                  </IconButton>
                  {s.locked ? (
                    <Box
                      sx={{
                        position: "absolute",
                        right: -4,
                        bottom: -4,
                        width: 16,
                        height: 16,
                        borderRadius: "999px",
                        bgcolor: "success.main",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid rgba(0,0,0,0.4)",
                      }}
                    >
                      <LockIcon sx={{ fontSize: 11, color: "black" }} />
                    </Box>
                  ) : null}
                  {props.isOwner && props.onLockStem ? (
                    <Tooltip title="Lock this version as default">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onLockStem?.(s.stemId);
                        }}
                        sx={{
                          position: "absolute",
                          left: -6,
                          bottom: -6,
                          bgcolor: "rgba(0,0,0,0.45)",
                        }}
                      >
                        <LockIcon sx={{ fontSize: 13 }} />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                </span>
              </Tooltip>
            ))}
          </Stack>
        ) : null}
        <Box sx={{ height: 8, borderRadius: 999, bgcolor: "rgba(255,255,255,0.08)" }} />
      </Stack>
    </Paper>
  );
}


