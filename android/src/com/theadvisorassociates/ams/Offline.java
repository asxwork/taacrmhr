package com.theadvisorassociates.ams;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** "No internet" screen with a Try again button. */
final class Offline {
    private Offline() { }

    static View build(MainActivity a, View.OnClickListener retry) {
        LinearLayout box = new LinearLayout(a);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.parseColor("#06121E"));
        box.setPadding(a.dp(32), a.dp(32), a.dp(32), a.dp(32));
        box.setClickable(true);

        TextView title = text(a, "No internet connection", 22, Color.WHITE);
        TextView body = text(a, "AMS needs the internet. Check Wi-Fi or mobile data, then try again.", 15, Color.parseColor("#B8C2CC"));
        body.setPadding(0, a.dp(10), 0, a.dp(24));

        Button b = new Button(a);
        b.setText("Try again");
        b.setAllCaps(false);
        b.setTextColor(Color.parseColor("#06121E"));
        b.setTextSize(16);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#E2C47A"));
        bg.setCornerRadius(a.dp(10));
        b.setBackground(bg);
        b.setPadding(a.dp(28), a.dp(12), a.dp(28), a.dp(12));
        b.setOnClickListener(retry);

        box.addView(title);
        box.addView(body);
        box.addView(b, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return box;
    }

    private static TextView text(Context c, String s, int size, int color) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(size);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        return t;
    }
}
