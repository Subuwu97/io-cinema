package com.mythicreverie.tv;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.view.View;

/** Remote-focusable navigation glyphs drawn consistently across TV fonts. */
public final class TvNavButton extends View {
 private final int icon; private final boolean active; private final Paint paint=new Paint(3);
 public TvNavButton(Context context,int icon,boolean active,String label){super(context);this.icon=icon;this.active=active;setContentDescription(label);setFocusable(true);setClickable(true);setOnFocusChangeListener((v,focused)->invalidate());}
 @Override protected void onDraw(Canvas c){super.onDraw(c);float scale=getResources().getDisplayMetrics().density;float cx=getWidth()/2f,cy=getHeight()/2f;c.save();c.translate(cx,cy);c.scale(scale,scale);paint.setStrokeWidth(1.6f);paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);paint.setStyle(Paint.Style.FILL);if(active||isFocused()){paint.setColor(0xffc6a16c);c.drawRoundRect(-getWidth()/scale/2+2,-13,-getWidth()/scale/2+5,13,2,2,paint);}if(isFocused()){paint.setColor(0x33c6a16c);c.drawRoundRect(-18,-19,18,19,5,5,paint);}paint.setColor(active||isFocused()?Color.WHITE:0xffaaaaaf);paint.setStyle(Paint.Style.STROKE);Path path=new Path();switch(icon){case 0:c.drawCircle(-2,-2,6,paint);c.drawLine(3,3,9,9,paint);break;case 1:path.moveTo(-9,0);path.lineTo(0,-8);path.lineTo(9,0);path.moveTo(-6,-2);path.lineTo(-6,8);path.lineTo(6,8);path.lineTo(6,-2);path.moveTo(-2,8);path.lineTo(-2,2);path.lineTo(2,2);path.lineTo(2,8);c.drawPath(path,paint);break;case 2:path.moveTo(-6,-9);path.lineTo(6,-9);path.lineTo(6,9);path.lineTo(0,4);path.lineTo(-6,9);path.close();c.drawPath(path,paint);break;case 3:for(int y=-1;y<=1;y+=2)for(int x=-1;x<=1;x+=2)c.drawRect(x*5-3,y*5-3,x*5+3,y*5+3,paint);break;case 5:path.moveTo(-7,5);path.quadTo(-5,1,-5,-3);path.cubicTo(-5,-10,5,-10,5,-3);path.quadTo(5,1,7,5);path.close();c.drawPath(path,paint);c.drawArc(-2,5,2,9,0,180,false,paint);break;case 6:c.drawRoundRect(-12,-13,12,13,3,3,paint);c.drawCircle(0,-4,4,paint);c.drawArc(-8,2,8,15,180,180,false,paint);break;default:c.drawCircle(0,0,5,paint);for(int i=0;i<8;i++){double angle=i*Math.PI/4;c.drawLine((float)Math.cos(angle)*7,(float)Math.sin(angle)*7,(float)Math.cos(angle)*10,(float)Math.sin(angle)*10,paint);}break;}c.restore();}
}
