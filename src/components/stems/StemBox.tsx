"use client";

import * as React from "react";
import { Box, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopIcon from "@mui/icons-material/Stop";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
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
        <Box sx={{ height: 8, borderRadius: 999, bgcolor: "rgba(255,255,255,0.08)" }} />
      </Stack>
    </Paper>
  );
}


