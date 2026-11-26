// The booking widget's custom elements (apps/widget), usable in JSX.
import "react";

type WidgetProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
  tenant?: string;
  "api-key"?: string;
  api?: string;
  location?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "gym-schedule": WidgetProps;
      "gym-lead-form": WidgetProps;
    }
  }
}
