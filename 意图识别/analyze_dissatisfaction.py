
import pandas as pd
import re
from collections import Counter

# 读取Excel文件中的'0_服务不满' sheet
file_path = '意图分类数据_按类别分组_含翻译.xlsx'
try:
    df = pd.read_excel(file_path, sheet_name='0_服务不满')
    print(f"成功读取 '0_服务不满' sheet，共 {len(df)} 条数据。\\n")
except Exception as e:
    print(f"读取Excel文件失败: {e}")
    exit()

# 进一步拆分和定义不满原因的分类和关键词
dissatisfaction_categories = {
    '无效回答/无法解决问题': [
        'useless', 'no help', "didn't solve", 'not solve', 'no answer', 'unhelpful', "couldn't help", 
        'did not understand', 'stupid', 'bot', 'robot', 'automated', 'garbage',
        '没用', '垃圾', '没解决', '无法解决', '不专业', '机器人', '答非所问', '不明白', '不知道'
    ],
    '等待时间长/响应慢': [
        'wait', 'long', 'slow', 'time', 'fast', 'quick', 'minute', 'hour', 'response',
        '效率', '慢', '等待', '等了', '时间', '太久', 'no one', 'no response', '没人', '没反应'
    ],
    '系统问题/流程中断': [
        'process', 'complicated', 'convoluted', 'loop', 'disconnect', 'end chat', 'system', 'website', 
        'navigation', 'dead end', 'cut me off', 'options', 'glitch', 'error', 'captcha',
        '流程', '复杂', '断开', '断线', '转接', '重复', 'repeat', 'difficult', 'hard', '打断', '切断', '导航', '死胡同', '选项', '错误', '问题', '验证码'
    ],
    '服务态度差': [
        'rude', 'attitude', 'unprofessional',
        '态度'
    ],
    '其他笼统负面反馈': [ # A catch-all for things that are negative but don't fit above
        'bad', 'horrible', 'awful', 'frustrating', 'disappointed', 'terrible', 'poor', 'shocking',
        '糟糕', '差', '不满'
    ]
}

# 初始化计数器
category_counts = Counter()
analyzed_indices = set()
reasons_examples = {key: [] for key in dissatisfaction_categories}

# 分析翻译列的内容
for index, row in df.iterrows():
    remark_text = str(row.get('翻译', '')).lower()
    if not remark_text or pd.isna(row.get('翻译')):
        continue

    # 优先匹配具体类别
    found_category = False
    category_order = ['系统问题/流程中断', '无效回答/无法解决问题', '等待时间长/响应慢', '服务态度差', '其他笼统负面反馈']

    for category in category_order:
        keywords = dissatisfaction_categories[category]
        if any(keyword in remark_text for keyword in keywords):
            if index not in analyzed_indices:
                category_counts[category] += 1
                if len(reasons_examples[category]) < 3:
                    example = {
                        'original': row['remark'],
                        'translated': row.get('翻译', '')
                    }
                    reasons_examples[category].append(example)
                analyzed_indices.add(index)
                found_category = True
                break

# 打印结果
print('📊 “服务不满”主要原因【深度分析】结果：\\n')
total_analyzed = len(analyzed_indices)
unclassified_count = len(df) - total_analyzed
print(f'（基于 {total_analyzed} / {len(df)} 条可识别的反馈，{unclassified_count}条未明确分类）\\n')

sorted_counts = category_counts.most_common()

for category, count in sorted_counts:
    percentage = (count / total_analyzed) * 100 if total_analyzed > 0 else 0
    print(f'### {category} (共 {count} 条, 占比 {percentage:.1f}%)')
    if reasons_examples[category]:
        print('    示例:')
        for ex in reasons_examples[category]:
            original_cleaned = str(ex['original']).replace('\\n', ' ').strip()
            translated_cleaned = str(ex['translated']).replace('\\n', ' ').strip()
            print(f'    - 原文: "{original_cleaned[:70]}{'...' if len(original_cleaned) > 70 else ''}"')
            print(f'      翻译: "{translated_cleaned[:70]}{'...' if len(translated_cleaned) > 70 else ''}"')
    print()

