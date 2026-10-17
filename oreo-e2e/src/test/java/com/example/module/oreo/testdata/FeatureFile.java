package com.example.module.oreo.testdata;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * A feature file read once: its lines, and its blocks (Feature, Background, Rule, Scenario, Scenario Outline) with
 * their tags and {@code Examples} tables. Line numbers are indexes into {@link #lines()}. {@link #render(List)}
 * writes lines back with the byte order mark, line separator and final newline of the file as read.
 */
final class FeatureFile {

    enum Kind { FEATURE, BACKGROUND, RULE, SCENARIO, OUTLINE }

    /**
     * An {@code Examples} table.
     *
     * @param tags       the tags above its {@code Examples:} line
     * @param headerLine the line of its header, -1 when no {@code |} line follows {@code Examples:}
     * @param lastLine   its last {@code |} line, -1 when it has none
     * @param indent     the leading whitespace of its header line
     */
    record Table(List<String> tags, int headerLine, int lastLine, String indent,
                 List<String> header, List<List<String>> rows) {

        /** That column's values, empty when the table has no such column. */
        List<String> column(String name) {
            int index = header.indexOf(name);
            if (index < 0) return List.of();
            List<String> values = new ArrayList<>();
            for (List<String> row : rows) {
                if (index < row.size()) values.add(row.get(index));
            }
            return List.copyOf(values);
        }
    }

    /**
     * @param line   the line of its keyword
     * @param rowId  the first {@code [TC-...]} of a Scenario or Outline name, otherwise null
     */
    record Block(Kind kind, List<String> tags, int line, String rowId, List<Table> examples) {}

    private static final String BOM = "﻿";

    private final Path file;
    private final boolean bom;
    private final String separator;
    private final boolean finalNewline;
    private final List<String> lines;
    private final List<Block> blocks;

    private FeatureFile(Path file, boolean bom, String separator, boolean finalNewline, List<String> lines) {
        this.file = file;
        this.bom = bom;
        this.separator = separator;
        this.finalNewline = finalNewline;
        this.lines = lines;
        this.blocks = parseBlocks(lines);
    }

    static FeatureFile read(Path file) {
        try {
            return parse(file, Files.readString(file, StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException("[FeatureFile] cannot read " + file, e);
        }
    }

    static FeatureFile parse(Path file, String text) {
        boolean bom = text.startsWith(BOM);
        String body = bom ? text.substring(BOM.length()) : text;
        String separator = body.contains("\r\n") ? "\r\n" : "\n";
        boolean finalNewline = body.endsWith("\n");
        List<String> lines = new ArrayList<>(Arrays.asList(body.split("\r?\n", -1)));
        if (finalNewline) lines.remove(lines.size() - 1);
        return new FeatureFile(file, bom, separator, finalNewline, List.copyOf(lines));
    }

    Path file() {
        return file;
    }

    List<String> lines() {
        return lines;
    }

    List<Block> blocks() {
        return blocks;
    }

    /** {@code lines} as file text, with the byte order mark, line separator and final newline as read. */
    String render(List<String> lines) {
        return (bom ? BOM : "") + String.join(separator, lines) + (finalNewline ? separator : "");
    }

    private static List<Block> parseBlocks(List<String> lines) {
        List<BlockBuilder> blocks = new ArrayList<>();
        List<String> pendingTags = new ArrayList<>();
        BlockBuilder current = null;
        TableBuilder table = null;
        String docString = null;
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i).strip();
            if (docString != null) {
                if (line.startsWith(docString)) docString = null;
                continue;
            }
            if (table != null) {
                if (line.startsWith("|")) {
                    table.add(i, lines.get(i), cells(line));
                    continue;
                }
                table = null;
            }
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            if (line.startsWith("\"\"\"") || line.startsWith("```")) {
                docString = line.substring(0, 3);
                pendingTags.clear();
            } else if (line.startsWith("@")) {
                for (String token : line.split("\\s+")) {
                    if (token.startsWith("@")) pendingTags.add(token);
                }
            } else if (startsWithAny(line, "Examples:", "Scenarios:")) {
                table = new TableBuilder(take(pendingTags));
                if (current != null) current.examples.add(table);
            } else if (startsWithAny(line, "Scenario Outline:", "Scenario Template:")) {
                current = new BlockBuilder(Kind.OUTLINE, take(pendingTags), i, CaseId.fromScenarioName(line));
                blocks.add(current);
            } else if (startsWithAny(line, "Scenario:", "Example:")) {
                current = new BlockBuilder(Kind.SCENARIO, take(pendingTags), i, CaseId.fromScenarioName(line));
                blocks.add(current);
            } else if (line.startsWith("Feature:")) {
                current = new BlockBuilder(Kind.FEATURE, take(pendingTags), i, null);
                blocks.add(current);
            } else if (line.startsWith("Background:")) {
                current = new BlockBuilder(Kind.BACKGROUND, take(pendingTags), i, null);
                blocks.add(current);
            } else if (line.startsWith("Rule:")) {
                current = new BlockBuilder(Kind.RULE, take(pendingTags), i, null);
                blocks.add(current);
            } else {
                pendingTags.clear();
            }
        }
        return blocks.stream().map(BlockBuilder::build).toList();
    }

    private static List<String> take(List<String> pendingTags) {
        List<String> tags = List.copyOf(pendingTags);
        pendingTags.clear();
        return tags;
    }

    private static List<String> cells(String tableLine) {
        String inner = tableLine.substring(1, tableLine.endsWith("|") && tableLine.length() > 1
                ? tableLine.length() - 1 : tableLine.length());
        List<String> cells = new ArrayList<>();
        for (String cell : inner.split("\\|", -1)) cells.add(cell.trim());
        return List.copyOf(cells);
    }

    private static boolean startsWithAny(String line, String... keywords) {
        for (String keyword : keywords) {
            if (line.startsWith(keyword)) return true;
        }
        return false;
    }

    private static final class BlockBuilder {
        final Kind kind;
        final List<String> tags;
        final int line;
        final String rowId;
        final List<TableBuilder> examples = new ArrayList<>();

        BlockBuilder(Kind kind, List<String> tags, int line, String rowId) {
            this.kind = kind;
            this.tags = tags;
            this.line = line;
            this.rowId = rowId;
        }

        Block build() {
            return new Block(kind, tags, line, rowId, examples.stream().map(TableBuilder::build).toList());
        }
    }

    private static final class TableBuilder {
        final List<String> tags;
        int headerLine = -1;
        int lastLine = -1;
        String indent = "";
        List<String> header = List.of();
        final List<List<String>> rows = new ArrayList<>();

        TableBuilder(List<String> tags) {
            this.tags = tags;
        }

        void add(int index, String rawLine, List<String> cells) {
            if (headerLine < 0) {
                headerLine = index;
                indent = rawLine.substring(0, rawLine.length() - rawLine.stripLeading().length());
                header = cells;
            } else {
                rows.add(cells);
            }
            lastLine = index;
        }

        Table build() {
            return new Table(tags, headerLine, lastLine, indent, header, List.copyOf(rows));
        }
    }
}
