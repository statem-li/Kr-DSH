/**
 * dsh-image-gallery — 生图画廊插件（host 半身）。
 *
 * 全部行为在 client bundle（dsh.client 声明）里：监听会话事件流中的
 * generate_image 工具调用（tool/call + tool/result），把成功生成的图片
 * 渲染成并排缩略图画廊（点击放大、右键另存）。host 半身仅作为 loader
 * 可挂载的插件包存在——client-modules 节点侧靠它发现并装配 client bundle。
 */
import type { Context } from 'cordis';
export declare const name = "@dsh-external/dsh-image-gallery";
export declare const inject: string[];
export declare function apply(_ctx: Context): void;
