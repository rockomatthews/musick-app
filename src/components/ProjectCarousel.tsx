"use client";

import * as React from "react";
import Link from "next/link";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Stack,
  Typography,
} from "@mui/material";

export type ProjectCardModel = {
  id: string;
  title: string;
  created_at: string;
  cover_image_url: string | null;
  contributors: number;
  approved_stems: number;
  contributor_names?: string[];
};

export function ProjectCarousel(props: { title: string; projects: ProjectCardModel[] }) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" fontWeight={900}>
        {props.title}
      </Typography>
      <Box
        sx={{
          display: "flex",
          gap: 2,
          overflowX: "auto",
          pb: 1,
          scrollSnapType: "x mandatory",
        }}
      >
        {props.projects.map((p) => (
          <Card
            key={p.id}
            variant="outlined"
            sx={{
              minWidth: 280,
              maxWidth: 280,
              scrollSnapAlign: "start",
              bgcolor: "background.paper",
            }}
          >
            <CardActionArea component={Link as any} href={`/projects/${p.id}`}>
              {p.cover_image_url ? (
                <CardMedia sx={{ height: 140, position: "relative" }}>
                  <Box
                    component="img"
                    src={p.cover_image_url}
                    alt={p.title}
                    sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </CardMedia>
              ) : (
                <CardMedia sx={{ height: 140, bgcolor: "rgba(255,255,255,0.06)" }} />
              )}
              <CardContent>
                <Typography fontWeight={900} noWrap>
                  {p.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {p.contributors} musicians • {p.approved_stems} approved stems
                </Typography>
                {p.contributor_names && p.contributor_names.length > 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    {p.contributor_names.join(", ")}
                    {p.contributors > p.contributor_names.length ? ` +${p.contributors - p.contributor_names.length}` : ""}
                  </Typography>
                ) : null}
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
        {props.projects.length === 0 ? (
          <Box sx={{ minWidth: 280, color: "text.secondary", py: 2 }}>
            No projects yet.
          </Box>
        ) : null}
      </Box>
    </Stack>
  );
}


