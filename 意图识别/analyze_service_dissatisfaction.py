#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import pandas as pd
import re
from collections import Counter, defaultdict

def analyze_service_dissatisfaction():
    """详细分析服务不满的具体原因"""
    
    # 读取数据
    df = pd.read_csv('/Users/lisa/AI/意图识别/用户需求意图识别_已标注_含翻译.csv')
    
    # 筛选包含"服务不满"的记录
    service_dissatisfaction_df = df[
        df['意图分类'].str.contains('服务不满', na=False) & 
        (df['starLevel'].isin([1.0, 2.0, 3.0]))
    ].copy()
    
    print(f"服务不满相关记录数: {len(service_dissatisfaction_df)}")
    
    # 收集所有用户反馈内容（remark和翻译）
    feedback_texts = []
    for _, row in service_dissatisfaction_df.iterrows():
        # 原始评论
        if pd.notna(row['remark']) and str(row['remark']).strip():
            feedback_texts.append({
                'text': str(row['remark']).strip(),
                'star_level': row['starLevel'],
                'type': 'original'
            })
        # 翻译内容
        if pd.notna(row['翻译']) and str(row['翻译']).strip():
            feedback_texts.append({
                'text': str(row['翻译']).strip(),
                'star_level': row['starLevel'],
                'type': 'translation'
            })
    
    print(f"收集到的反馈文本数量: {len(feedback_texts)}")
    
    # 定义服务不满的关键词模式和分类
    dissatisfaction_patterns = {
        "响应时间长/等待时间长": [
            r'(?i)(wait|waiting|long|slow|delay|timeout|time.*out|等待|慢|延迟|超时|时间.*长|响应.*慢)',
            r'(?i)(took.*long|takes.*long|很久|太久|花.*时间|等了.*久)'
        ],
        "无效回答/无法解决问题": [
            r'(?i)(no.*answer|not.*answer|didn\'t.*answer|无.*答案|没.*回答|无.*回复)',
            r'(?i)(useless|not.*help|can\'t.*help|无用|没用|解决.*不了|帮.*不了)',
            r'(?i)(not.*work|doesn\'t.*work|not.*solve|无效|不起作用|不能.*解决)'
        ],
        "系统故障/技术问题": [
            r'(?i)(system.*error|technical.*issue|bug|crash|系统.*错误|技术.*问题|故障)',
            r'(?i)(not.*working|broken|down|坏了|不工作|无法.*运行)'
        ],
        "客服态度问题": [
            r'(?i)(rude|impolite|bad.*attitude|terrible.*service|粗鲁|不礼貌|态度.*差|服务.*差)',
            r'(?i)(unprofessional|不专业|服务.*态度)'
        ],
        "理解错误/沟通不畅": [
            r'(?i)(don\'t.*understand|misunderstand|wrong.*answer|不理解|理解.*错|答.*错)',
            r'(?i)(communication.*problem|language.*barrier|沟通.*问题|语言.*障碍)'
        ],
        "功能缺失/限制": [
            r'(?i)(can\'t.*do|unable.*to|limitation|restricted|不能.*做|无法.*实现|限制|受限)',
            r'(?i)(missing.*feature|lack.*function|缺少.*功能|没有.*功能)'
        ],
        "流程复杂/操作困难": [
            r'(?i)(complicated|complex|difficult|hard.*to|复杂|困难|难.*操作)',
            r'(?i)(confusing|unclear|不清楚|混乱|搞不懂)'
        ],
        "信息不准确/过时": [
            r'(?i)(wrong.*information|incorrect|outdated|old.*info|错误.*信息|信息.*错|过时)',
            r'(?i)(not.*accurate|inaccurate|不准确|不正确)'
        ],
        "重复询问/循环问题": [
            r'(?i)(repeat|again.*again|same.*question|重复|一直.*问|反复|循环)',
            r'(?i)(keep.*asking|asking.*same|问.*同样|一直.*重复)'
        ],
        "无人工服务/转人工失败": [
            r'(?i)(human.*agent|real.*person|transfer.*human|人工|转.*人工|真人)',
            r'(?i)(robot|bot|机器人|自动.*回复)'
        ],
        "服务中断/连接问题": [
            r'(?i)(disconnect|connection.*lost|service.*down|中断|断开|连接.*问题)',
            r'(?i)(network.*error|连接.*错误|网络.*问题)'
        ],
        "不相关回答/答非所问": [
            r'(?i)(irrelevant|not.*related|off.*topic|答非所问|不相关|跑题)',
            r'(?i)(wrong.*topic|不对.*题|回答.*不对)'
        ]
    }
    
    # 分析每个反馈文本
    categorized_feedback = defaultdict(list)
    uncategorized_feedback = []
    
    for feedback in feedback_texts:
        text = feedback['text']
        categorized = False
        
        # 检查每个不满类别
        for category, patterns in dissatisfaction_patterns.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    categorized_feedback[category].append({
                        'text': text,
                        'star_level': feedback['star_level'],
                        'type': feedback['type']
                    })
                    categorized = True
                    break
            if categorized:
                break
        
        if not categorized:
            uncategorized_feedback.append(feedback)
    
    # 输出分析结果
    print("\n=== 服务不满具体原因分析 ===")
    print("=" * 60)
    
    # 按数量排序
    sorted_categories = sorted(categorized_feedback.items(), 
                              key=lambda x: len(x[1]), reverse=True)
    
    total_categorized = sum(len(feedbacks) for _, feedbacks in sorted_categories)
    
    for i, (category, feedbacks) in enumerate(sorted_categories, 1):
        count = len(feedbacks)
        percentage = (count / total_categorized) * 100 if total_categorized > 0 else 0
        print(f"\n{i:2d}. {category}")
        print(f"    数量: {count} 条 ({percentage:.1f}%)")
        
        # 显示几个典型例子
        print("    典型例子:")
        examples = feedbacks[:3]  # 显示前3个例子
        for j, example in enumerate(examples, 1):
            text = example['text'][:100] + "..." if len(example['text']) > 100 else example['text']
            print(f"      {j}. [{example['star_level']}分] {text}")
    
    print(f"\n未分类的反馈数量: {len(uncategorized_feedback)}")
    
    # 显示一些未分类的例子，用于进一步分析
    if uncategorized_feedback:
        print("\n未分类反馈示例（前10条）:")
        for i, feedback in enumerate(uncategorized_feedback[:10], 1):
            text = feedback['text'][:80] + "..." if len(feedback['text']) > 80 else feedback['text']
            print(f"  {i}. [{feedback['star_level']}分] {text}")
    
    # 生成详细报告
    with open('/Users/lisa/AI/意图识别/service_dissatisfaction_detailed_analysis.txt', 'w', encoding='utf-8') as f:
        f.write("服务不满详细原因分析报告\n")
        f.write("=" * 60 + "\n\n")
        
        f.write(f"总体情况:\n")
        f.write(f"- 服务不满相关记录: {len(service_dissatisfaction_df)} 条\n")
        f.write(f"- 已分类反馈: {total_categorized} 条\n")
        f.write(f"- 未分类反馈: {len(uncategorized_feedback)} 条\n\n")
        
        f.write("服务不满具体原因排序（按数量降序）:\n")
        f.write("-" * 60 + "\n")
        
        for i, (category, feedbacks) in enumerate(sorted_categories, 1):
            count = len(feedbacks)
            percentage = (count / total_categorized) * 100 if total_categorized > 0 else 0
            f.write(f"\n{i:2d}. {category}\n")
            f.write(f"    数量: {count} 条 ({percentage:.1f}%)\n")
            
            # 按评分统计
            star_dist = Counter([fb['star_level'] for fb in feedbacks])
            f.write(f"    评分分布: ")
            for star in sorted(star_dist.keys()):
                f.write(f"{star}分({star_dist[star]}条) ")
            f.write("\n")
            
            f.write("    典型例子:\n")
            for j, example in enumerate(feedbacks[:5], 1):  # 报告中显示前5个例子
                f.write(f"      {j}. [{example['star_level']}分] {example['text']}\n")
        
        if uncategorized_feedback:
            f.write(f"\n未分类反馈示例:\n")
            for i, feedback in enumerate(uncategorized_feedback[:20], 1):
                f.write(f"  {i}. [{feedback['star_level']}分] {feedback['text']}\n")
    
    print(f"\n详细分析报告已保存到: /Users/lisa/AI/意图识别/service_dissatisfaction_detailed_analysis.txt")
    
    return sorted_categories

if __name__ == "__main__":
    analyze_service_dissatisfaction()

