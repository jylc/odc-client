/*
 * Copyright 2023 OceanBase
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import compareVersions, { compare } from 'compare-versions';

export const ODC_TRACE_SUPPORT_VERSION = '4.1.0';
export const ODC_VERSION_SEP = '.';

/**
 * 提取版本串开头连续的数字点分 段，用于兜底无法被 semver 解析的
 * 第三方数据库版本串（如 PostgreSQL 的 "17.1 (Debian 17.1-1.pgdg120+1)"）。
 * 可正常解析的版本不会走到该兜底，行为保持不变。
 */
function extractLeadingNumericVersion(version: string): string {
  const matched = version?.match(/\d+(\.\d+)*/);
  return matched ? matched[0] : version;
}

function safeCompare(
  firstVersion: string,
  secondVersion: string,
  operator?: compareVersions.CompareOperator,
): boolean | 1 | 0 | -1 {
  try {
    return operator
      ? compare(firstVersion, secondVersion, operator)
      : compareVersions(firstVersion, secondVersion);
  } catch (e) {
    const first = extractLeadingNumericVersion(firstVersion);
    const second = extractLeadingNumericVersion(secondVersion);
    return operator ? compare(first, second, operator) : compareVersions(first, second);
  }
}

/**
 * 对compare-versions做一定的检验与封装
 * @param firstVersion
 * @param secondVersion
 * @returns 1 | 0 | -1
 */
export function OBCompareVersions(firstVersion: string, secondVersion: string): 1 | 0 | -1 {
  const firstVersionSlice = firstVersion?.split(ODC_VERSION_SEP) || [];
  const secondVersionSlice = secondVersion?.split(ODC_VERSION_SEP) || [];
  if (firstVersionSlice?.length < secondVersionSlice?.length) {
    throw Error(`fisrtVersion's version is short than secondVersion, please check firstVersion.`);
  } else if (firstVersionSlice?.length >= secondVersionSlice?.length) {
    return safeCompare(
      firstVersionSlice?.slice(0, secondVersionSlice?.length)?.join(''),
      secondVersionSlice?.join(''),
    ) as 1 | 0 | -1;
  } else {
    return safeCompare(firstVersion, secondVersion) as 1 | 0 | -1;
  }
}
/**
 * 对compare-versions的compare方法做一定的检验与封装
 * @param firstVersion
 * @param secondVersion
 * @param operator
 * @returns boolean
 */
export function OBCompare(
  firstVersion: string,
  secondVersion: string,
  operator: compareVersions.CompareOperator,
): boolean {
  const firstVersionSlice = firstVersion?.split(ODC_VERSION_SEP) || [];
  const secondVersionSlice = secondVersion?.split(ODC_VERSION_SEP) || [];
  if (firstVersionSlice?.length < secondVersionSlice?.length) {
    throw Error(`fisrtVersion's version is short than secondVersion, please check firstVersion.`);
  } else if (firstVersionSlice?.length >= secondVersionSlice?.length) {
    return safeCompare(
      firstVersionSlice?.slice(0, secondVersionSlice?.length)?.join(''),
      secondVersionSlice?.join(''),
      operator,
    ) as boolean;
  } else {
    return safeCompare(firstVersion, secondVersion, operator) as boolean;
  }
}
