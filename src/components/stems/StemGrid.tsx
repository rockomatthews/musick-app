"use client";

import * as React from "react";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import AddBoxOutlinedIcon from "@mui/icons-material/AddBoxOutlined";
import { STEM_TYPES, type StemType } from "@/lib/stems/types";
import { StemBox, type StemBoxStatus } from "./StemBox";

export function StemGrid(props: {
  columnCount: number;
  onAddColumn: () => void;
  onAiMidi?: (stemType: StemType, columnIndex: number) => void;
  statusFor?: (stemType: StemType, columnIndex: number) => StemBoxStatus;
  isRecordingFor?: (stemType: StemType, columnIndex: number) => boolean;
  onRecordToggle?: (stemType: StemType, columnIndex: number) => void;
  canPlayFor?: (stemType: StemType, columnIndex: number) => boolean;
  isPlayingFor?: (stemType: StemType, columnIndex: number) => boolean;
  onPlayToggle?: (stemType: StemType, columnIndex: number) => void;
  submissionsFor?: (stemType: StemType, columnIndex: number) => { userId: string; label: string; avatarUrl: string | null; stemId: string; locked: boolean }[];
  isOwner?: boolean;
  onLockStem?: (stemId: string) => void;
  onPlayStem?: (stemId: string) => void;
  onSelectStem?: (stemType: StemType, columnIndex: number, stemId: string) => void;
  renderColumnHeader?: (columnIndex: number) => React.ReactNode;
}) {
  const statusFor = props.statusFor ?? (() => "empty" as StemBoxStatus);
  return (
    <Box sx={{ overflowX: "auto", pb: 1 }}>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Stack spacing={2} sx={{ minWidth: 190 }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography fontWeight={900}>Stems</Typography>
            <Tooltip title="Add a new column (layer set)">
              <IconButton onClick={props.onAddColumn} aria-label="Add column">
                <AddBoxOutlinedIcon />
              </IconButton>
            </Tooltip>
          </Stack>

          {STEM_TYPES.map((s) => (
            <Box key={s.type} sx={{ minHeight: 92, display: "flex", alignItems: "center" }}>
              <Typography fontWeight={800} color="text.secondary">
                {s.label}
              </Typography>
            </Box>
          ))}
        </Stack>

        {Array.from({ length: props.columnCount }).map((_, col) => (
          <Stack key={col} spacing={2} sx={{ minWidth: 220 }}>
            <Box sx={{ minHeight: 40, display: "flex", alignItems: "center" }}>
              {props.renderColumnHeader ? props.renderColumnHeader(col) : null}
            </Box>
            {STEM_TYPES.map((s) => (
              <StemBox
                key={`${s.type}-${col}`}
                stemType={s.type}
                columnIndex={col}
                status={statusFor(s.type, col)}
                onAiMidi={props.onAiMidi}
                isRecording={props.isRecordingFor?.(s.type, col) ?? false}
                onRecordToggle={props.onRecordToggle}
                canPlay={props.canPlayFor?.(s.type, col) ?? false}
                isPlaying={props.isPlayingFor?.(s.type, col) ?? false}
                onPlayToggle={props.onPlayToggle}
                submissions={props.submissionsFor?.(s.type, col) ?? []}
                isOwner={props.isOwner}
                onLockStem={props.onLockStem}
                onPlayStem={props.onPlayStem}
                onSelectStem={props.onSelectStem}
              />
            ))}
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}


