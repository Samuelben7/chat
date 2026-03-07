declare module 'react-icons/bs' {
  import { FC, SVGProps } from 'react';

  interface IconProps extends SVGProps<SVGSVGElement> {
    size?: number | string;
  }

  export const BsSearch: FC<IconProps>;
  export const BsCheck: FC<IconProps>;
  export const BsCheckAll: FC<IconProps>;
  export const BsThreeDotsVertical: FC<IconProps>;
  export const BsArrowLeft: FC<IconProps>;
  export const BsSend: FC<IconProps>;
  export const BsEmojiSmile: FC<IconProps>;
}
