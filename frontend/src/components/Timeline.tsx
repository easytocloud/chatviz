import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { CapturedMessage } from '../types';
import { MESSAGE_COLORS, FAMILY_COLORS, DIRECTION_OPACITY } from '../styles/colors';
import { useMessageStore } from '../store/messages';

interface Props {
  messages: CapturedMessage[];
}

const ROW_HEIGHT = 36;
const ROW_GAP = 4;
const LABEL_WIDTH = 90;
const BAR_HEIGHT = 24;
const PADDING = { top: 10, right: 16, bottom: 10, left: LABEL_WIDTH };

export function Timeline({ messages }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const setSelected = useMessageStore((s) => s.setSelected);
  const selectedId = useMessageStore((s) => s.selectedId);

  const draw = useCallback(() => {
    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    if (!svg || !container) return;

    svg.selectAll('*').remove();

    const width = container.clientWidth;
    const totalRows = messages.length;
    const height = Math.max(
      400,
      PADDING.top + totalRows * (ROW_HEIGHT + ROW_GAP) + PADDING.bottom
    );

    svg.attr('width', width).attr('height', height);

    if (messages.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', 200)
        .attr('text-anchor', 'middle')
        .attr('fill', '#4B5563')
        .attr('font-size', 14)
        .text('No messages yet — point your agent at http://localhost:7890');
      return;
    }

    const g = svg.append('g').attr('transform', `translate(${PADDING.left},${PADDING.top})`);
    const innerWidth = width - PADDING.left - PADDING.right;

    // Time scale across the full width
    const minTs = d3.min(messages, (m) => m.timestamp)!;
    const maxTs = d3.max(messages, (m) => m.timestamp)!;
    const tsDomain = maxTs === minTs ? [minTs - 1000, maxTs + 1000] : [minTs, maxTs];
    const xScale = d3.scaleLinear().domain(tsDomain).range([0, innerWidth]);

    // Draw each message as a horizontal bar
    messages.forEach((msg, i) => {
      const y = i * (ROW_HEIGHT + ROW_GAP);
      const color = MESSAGE_COLORS[msg.message_type];
      const opacity = DIRECTION_OPACITY[msg.direction];
      const isSelected = msg.id === selectedId;

      const row = g.append('g')
        .attr('transform', `translate(0,${y})`)
        .style('cursor', 'pointer')
        .on('click', () => setSelected(isSelected ? null : msg.id));

      // background highlight on selected
      if (isSelected) {
        row.append('rect')
          .attr('x', -PADDING.left)
          .attr('width', width)
          .attr('height', ROW_HEIGHT + ROW_GAP)
          .attr('fill', '#1E3A5F')
          .attr('rx', 2);
      }

      // hover
      row.on('mouseenter', function () {
        if (!isSelected) d3.select(this).select('rect.bar').attr('opacity', 1);
      }).on('mouseleave', function () {
        if (!isSelected) d3.select(this).select('rect.bar').attr('opacity', opacity);
      });

      // left label: message_type
      row.append('text')
        .attr('x', -8)
        .attr('y', (ROW_HEIGHT + BAR_HEIGHT) / 2 - 4)
        .attr('text-anchor', 'end')
        .attr('fill', color)
        .attr('font-size', 11)
        .attr('font-family', 'system-ui, sans-serif')
        .text(msg.message_type.replace('_', ' '));

      // direction arrow
      row.append('text')
        .attr('x', -8)
        .attr('y', (ROW_HEIGHT + BAR_HEIGHT) / 2 + 8)
        .attr('text-anchor', 'end')
        .attr('fill', '#6B7280')
        .attr('font-size', 9)
        .text(msg.direction === 'request' ? '→ req' : '← resp');

      // bar
      const barX = Math.min(xScale(msg.timestamp), innerWidth - 4);
      const barW = Math.max(4, innerWidth * 0.005);

      row.append('rect')
        .attr('class', 'bar')
        .attr('x', barX)
        .attr('y', (ROW_HEIGHT - BAR_HEIGHT) / 2)
        .attr('width', barW)
        .attr('height', BAR_HEIGHT)
        .attr('fill', color)
        .attr('opacity', opacity)
        .attr('rx', 3);

      // family dot
      row.append('circle')
        .attr('cx', barX + barW + 6)
        .attr('cy', ROW_HEIGHT / 2)
        .attr('r', 4)
        .attr('fill', FAMILY_COLORS[msg.api_family]);

      // model label to the right of bar
      const labelX = barX + barW + 14;
      if (labelX + 60 < innerWidth) {
        row.append('text')
          .attr('x', labelX)
          .attr('y', ROW_HEIGHT / 2 + 4)
          .attr('fill', '#9CA3AF')
          .attr('font-size', 10)
          .attr('font-family', 'monospace')
          .text(msg.model.length > 24 ? msg.model.slice(0, 22) + '…' : msg.model);
      }

      // MCP badge
      if (msg.mcp_server) {
        row.append('text')
          .attr('x', barX)
          .attr('y', (ROW_HEIGHT - BAR_HEIGHT) / 2 - 2)
          .attr('fill', '#F59E0B')
          .attr('font-size', 9)
          .text(`mcp:${msg.mcp_server}`);
      }
    });

    // time axis at top
    const axis = d3.axisTop(xScale)
      .ticks(5)
      .tickFormat((d) => {
        const dt = new Date(+d);
        return `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}:${dt.getSeconds().toString().padStart(2, '0')}`;
      });

    g.append('g')
      .attr('class', 'axis')
      .call(axis)
      .call((g) => g.select('.domain').attr('stroke', '#374151'))
      .call((g) => g.selectAll('text').attr('fill', '#6B7280').attr('font-size', 10))
      .call((g) => g.selectAll('line').attr('stroke', '#374151'));

  }, [messages, selectedId, setSelected]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'auto' }}>
      <svg ref={svgRef} style={{ display: 'block' }} />
    </div>
  );
}
