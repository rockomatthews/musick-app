"use client";

import * as React from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type { StemType } from "@/lib/stems/types";

export type StemBoxStatus = "empty" | "pending" | "approved";

export function StemBox(props: {
  stemType: StemType;
  columnIndex: number;
  status: StemBoxStatus;
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
      }}
    >
      <Stack spacing={1} sx={{ width: "100%" }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography fontWeight={800} variant="body2">
            {props.columnIndex + 1}
          </Typography>
          <Chip size="small" label={label} color={color} variant={props.status === "empty" ? "outlined" : "filled"} />
        </Stack>
        <Box sx={{ height: 8, borderRadius: 999, bgcolor: "rgba(255,255,255,0.08)" }} />
      </Stack>
    </Paper>
  );
}


