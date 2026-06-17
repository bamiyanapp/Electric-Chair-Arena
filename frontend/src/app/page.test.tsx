import { describe, it, expect } from 'vitest';
import Home from './page';
import React from 'react';

describe('Home Component', () => {
  it('should render main wrapper and title', () => {
    const result = Home() as React.ReactElement<{ children: React.ReactElement[] }>;
    expect(result.type).toBe('main');
    
    // 子要素を探索してタイトルを確認するユニットテスト
    const h1 = result.props.children.find((child) => child && child.type === 'h1') as React.ReactElement<{ children: string }> | undefined;
    expect(h1).toBeDefined();
    expect(h1?.props.children).toBe('ハンコマスター検定');
  });

  it('should render description paragraph', () => {
    const result = Home() as React.ReactElement<{ children: React.ReactElement[] }>;
    const p = result.props.children.find((child) => child && child.type === 'p') as React.ReactElement<{ children: string }> | undefined;
    expect(p).toBeDefined();
    expect(p?.props.children).toContain('誠意ある捺印こそが、社会人の基本です。');
  });

  it('should render start button', () => {
    const result = Home() as React.ReactElement<{ children: React.ReactElement[] }>;
    const button = result.props.children.find((child) => child && child.type === 'button') as React.ReactElement<{ children: string }> | undefined;
    expect(button).toBeDefined();
    expect(button?.props.children).toBe('検定を開始する');
  });
});
