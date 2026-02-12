#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import pandas as pd
import numpy as np
from collections import Counter

def analyze_low_rating_pain_points():
    """分析starLevel为1-3分用户的核心痛点"""
    
    # 读取数据
    try:
        df = pd.read_csv('/Users/lisa/AI/意图识别/用户需求意图识别_已标注_含翻译.csv')
        print(f"成功读取数据，共 {len(df)} 条记录")
    except Exception as e:
        print(f"读取数据失败: {e}")
        return
    
    # 查看数据基本信息
    print("\n数据列名:")
    print(df.columns.tolist())
    
    print("\nstarLevel分布:")
    print(df['starLevel'].value_counts().sort_index())
    
    # 筛选starLevel为1-3分的数据
    low_rating_df = df[df['starLevel'].isin([1.0, 2.0, 3.0])]
    print(f"\nstarLevel为1-3分的记录数: {len(low_rating_df)}")
    
    # 分析意图分类分布
    print("\n=== starLevel 1-3分用户的意图分类分析 ===")
    
    # 处理多个意图分类的情况（用逗号分隔）
    all_intents = []
    for intent_str in low_rating_df['意图分类'].dropna():
        if pd.notna(intent_str) and intent_str != '无效数据':
            # 分割多个意图
            intents = [intent.strip() for intent in str(intent_str).split(',')]
            all_intents.extend(intents)
    
    # 统计意图分类频次
    intent_counter = Counter(all_intents)
    
    print(f"总计意图分类数量: {len(all_intents)}")
    print(f"不同意图分类种类: {len(intent_counter)}")
    
    # 按数量降序排列
    sorted_intents = intent_counter.most_common()
    
    print("\n核心痛点排序（按数量降序）:")
    print("-" * 50)
    for i, (intent, count) in enumerate(sorted_intents, 1):
        percentage = (count / len(all_intents)) * 100
        print(f"{i:2d}. {intent:<15} : {count:4d} 次 ({percentage:5.1f}%)")
    
    # 按starLevel分别分析
    print("\n=== 按starLevel分别分析 ===")
    for star_level in [1.0, 2.0, 3.0]:
        subset = low_rating_df[low_rating_df['starLevel'] == star_level]
        print(f"\n--- starLevel {star_level} (共{len(subset)}条记录) ---")
        
        subset_intents = []
        for intent_str in subset['意图分类'].dropna():
            if pd.notna(intent_str) and intent_str != '无效数据':
                intents = [intent.strip() for intent in str(intent_str).split(',')]
                subset_intents.extend(intents)
        
        if subset_intents:
            subset_counter = Counter(subset_intents)
            top_5 = subset_counter.most_common(5)
            for j, (intent, count) in enumerate(top_5, 1):
                percentage = (count / len(subset_intents)) * 100
                print(f"  {j}. {intent:<15} : {count:3d} 次 ({percentage:5.1f}%)")
    
    # 分析售前/售后分布
    print("\n=== 售前/售后分布分析 ===")
    presale_postsale = low_rating_df['售前/售后'].value_counts()
    print(presale_postsale)
    
    # 分析渠道分布
    print("\n=== 渠道分布分析 ===")
    channel_dist = low_rating_df['渠道channel'].value_counts().head(10)
    print("Top 10 渠道:")
    print(channel_dist)
    
    # 生成详细报告
    print("\n=== 详细分析报告 ===")
    print(f"1. 总体情况:")
    print(f"   - 低评分用户(1-3分)共 {len(low_rating_df)} 人")
    print(f"   - 占总用户比例: {len(low_rating_df)/len(df)*100:.1f}%")
    
    print(f"\n2. 核心痛点TOP5:")
    for i, (intent, count) in enumerate(sorted_intents[:5], 1):
        percentage = (count / len(all_intents)) * 100
        print(f"   {i}. {intent}: {count}次 ({percentage:.1f}%)")
    
    # 保存结果到文件
    with open('/Users/lisa/AI/意图识别/low_rating_analysis_report.txt', 'w', encoding='utf-8') as f:
        f.write("starLevel 1-3分用户核心痛点分析报告\n")
        f.write("=" * 50 + "\n\n")
        
        f.write(f"总体情况:\n")
        f.write(f"- 低评分用户(1-3分)共 {len(low_rating_df)} 人\n")
        f.write(f"- 占总用户比例: {len(low_rating_df)/len(df)*100:.1f}%\n\n")
        
        f.write("核心痛点排序（按数量降序）:\n")
        f.write("-" * 50 + "\n")
        for i, (intent, count) in enumerate(sorted_intents, 1):
            percentage = (count / len(all_intents)) * 100
            f.write(f"{i:2d}. {intent:<15} : {count:4d} 次 ({percentage:5.1f}%)\n")
    
    print(f"\n分析报告已保存到: /Users/lisa/AI/意图识别/low_rating_analysis_report.txt")
    
    return sorted_intents, low_rating_df

if __name__ == "__main__":
    analyze_low_rating_pain_points()
